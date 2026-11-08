import { loadEnvFile } from "../utils/env.js";

loadEnvFile();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Provider {
  name: string;
  url: string;
  apiKey: string;
  model: string;
}

function getProviders(): Provider[] {
  const list: Provider[] = [];

  // Primary: OpenRouter
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    list.push({
      name: "openrouter",
      url: OPENROUTER_URL,
      apiKey: orKey,
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"
    });
  }

  // Backup: configurable LLM provider (e.g. 9router)
  const bKey = process.env.LLM_BACKUP_API_KEY;
  const bUrl = process.env.LLM_BACKUP_URL;
  if (bKey && bUrl) {
    list.push({
      name: process.env.LLM_BACKUP_NAME || "backup",
      url: bUrl.endsWith("/chat/completions")
        ? bUrl
        : bUrl.replace(/\/$/, "") + "/chat/completions",
      apiKey: bKey,
      model: process.env.LLM_BACKUP_MODEL || "9router"
    });
  }

  return list;
}

export function llmConfigured(): boolean {
  return getProviders().length > 0;
}

export function llmModel(): string {
  const providers = getProviders();
  return providers[0]?.model || "openai/gpt-4o-mini";
}

const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60_000);

/**
 * Chat completion with exponential-backoff retry and a hard timeout.
 * Tries each configured provider in order; on final failure of one,
 * falls through to the next (backup). Retries on network errors and 5xx / 429.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const providers = getProviders();
  if (providers.length === 0) {
    throw new Error("Tidak ada LLM provider terkonfigurasi. Set OPENROUTER_API_KEY atau LLM_BACKUP_* di file .env.");
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    const body = JSON.stringify({
      model: provider.model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 1024,
      // 9router (dan beberapa gateway lain) merespons SSE secara default;
      // paksa JSON non-stream agar bisa di-parse sebagai objek chat.completion.
      stream: false
    });

    let failed = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "memory-coder"
          },
          body,
          signal: controller.signal
        });

        clearTimeout(timer);

        // Retry on rate-limit and server errors
        if (res.status === 429 || res.status >= 500) {
          const text = await res.text().catch(() => "");
          lastError = new Error(`${provider.name} ${res.status}: ${text.slice(0, 300)}`);
          if (attempt < MAX_RETRIES) {
            await sleep(backoffMs(attempt));
            continue;
          }
          failed = true; // exhausted retries on this provider -> try next
          break;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          // Non-retriable error -> fall through to backup provider
          lastError = new Error(`${provider.name} ${res.status}: ${text.slice(0, 400)}`);
          failed = true;
          break;
        }

        const data = (await res.json()) as any;
        return data?.choices?.[0]?.message?.content ?? "";
      } catch (e: any) {
        clearTimeout(timer);
        // AbortError = timeout
        if (e?.name === "AbortError") {
          lastError = new Error(`${provider.name}: LLM request timed out after ${TIMEOUT_MS}ms`);
        } else {
          lastError = e instanceof Error ? e : new Error(String(e));
        }
        // Only retry on transient errors (network/timeout), not on bad request
        if (attempt < MAX_RETRIES && isTransient(lastError)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        failed = true;
        break;
      }
    }

    if (!failed) {
      // Should not reach here (success returns early), but be safe.
      continue;
    }
    // Move on to next provider (backup)
  }

  throw lastError ?? new Error("LLM request failed across all providers");
}

function isTransient(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("429") ||
    /\b5\d\d\b/.test(msg)
  );
}

function backoffMs(attempt: number): number {
  // 500ms, 1000ms, 2000ms ...
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
