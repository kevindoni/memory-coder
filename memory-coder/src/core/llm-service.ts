import { loadEnvFile } from "../utils/env.js";

loadEnvFile();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function llmModel(): string {
  return process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
}

const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60_000);

/**
 * Chat completion with exponential-backoff retry and a hard timeout.
 * Retries on network errors and 5xx / 429 responses.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY belum dikonfigurasi. Set di file .env (lihat integrations/).");
  }

  const body = JSON.stringify({
    model: llmModel(),
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.maxTokens ?? 1024
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
      }

      const data = (await res.json()) as any;
      return data?.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      clearTimeout(timer);
      // AbortError = timeout
      if (e?.name === "AbortError") {
        lastError = new Error(`LLM request timed out after ${TIMEOUT_MS}ms`);
      } else {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
      // Only retry on transient errors (network/timeout), not on bad request
      if (attempt < MAX_RETRIES && isTransient(lastError)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("LLM request failed");
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
