import { createMemory, getProject, updateProjectLastActive } from "../db/index.js";
import { getEmbedder } from "../embeddings/index.js";
import { chatCompletion, llmConfigured, llmModel } from "./llm-service.js";
import { recordLog } from "./log-service.js";

const VALID_TYPES = ["decision", "pattern", "learning", "bug", "general"];

interface CaptureArgs {
  conversation?: string;
  messages?: Array<{ role: string; content: string }>;
  project_id?: string | null;
  project_name?: string | null;
}

function normalizeConversation(args: CaptureArgs): string {
  if (args.conversation && args.conversation.trim()) return args.conversation.trim();
  if (Array.isArray(args.messages) && args.messages.length) {
    return args.messages
      .map((m) => `[${m.role || "user"}]: ${m.content}`)
      .join("\n\n");
  }
  return "";
}

interface ExtractedMemory {
  type?: string;
  title?: string;
  content?: string;
  tags?: string[];
}

/**
 * Analyzes a conversation (user <-> AI) and extracts durable, typed memories
 * using the LLM. Stores each with its embedding. Designed to be called at the
 * end of a session/task so nothing valuable is lost.
 */
export async function captureConversationService(args: unknown) {
  const body = args as CaptureArgs;

  const conversationText = normalizeConversation(body);
  if (!conversationText) {
    return { success: false, error: "conversation atau messages wajib diisi" };
  }
  if (!llmConfigured()) {
    return { success: false, error: "OpenRouter belum dikonfigurasi. Set OPENROUTER_API_KEY di .env" };
  }

  // resolve project scope
  let projectId: string | null = null;
  let projectName: string | null = null;
  if (body.project_id) {
    projectId = body.project_id;
    projectName = getProject(body.project_id)?.name ?? null;
  } else if (body.project_name) {
    const p = getProject(body.project_name);
    if (p) {
      projectId = p.id;
      projectName = p.name;
      updateProjectLastActive(p.id);
    }
  }

  const systemPrompt =
    `You are a memory extractor for a coding assistant. ` +
    `Analyze the conversation below (between a user and an AI coding assistant) and extract DURABLE, REUSABLE memories that would help future sessions. ` +
    `Classify each as exactly one of: decision, pattern, learning, bug, general. ` +
    `Extract things like: architecture decisions, bug fixes and their solutions, reusable code patterns, project conventions, important learnings, tech choices. ` +
    `Do NOT extract: trivial chat, greetings, small talk, or anything already obvious from code. ` +
    `Each memory must be concise but self-contained — a future agent with zero context must understand it. ` +
    `Respond ONLY with a raw JSON array — no markdown, no explanation.`;

  const userPrompt =
    (projectName ? `Project context: ${projectName}\n\n` : "") +
    `Conversation:\n${conversationText.slice(0, 12000)}\n\n` +
    `Extract memories as JSON array:\n` +
    `[{"type":"decision","title":"short descriptive title","content":"self-contained explanation with the why","tags":["relevant","tags"]}]`;

  let raw: string;
  try {
    raw = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      { temperature: 0.2, maxTokens: 2048 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `LLM error: ${msg}` };
  }

  let extracted: ExtractedMemory[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    extracted = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return { success: false, error: "LLM response bukan JSON valid", raw: raw.slice(0, 500) };
  }

  if (!Array.isArray(extracted) || extracted.length === 0) {
    return { success: true, extracted: 0, memories: [], message: "Tidak ada memori yang bisa diekstrak" };
  }

  const embedder = getEmbedder();
  const stored = [];

  for (const mem of extracted) {
    if (!mem.content || !mem.content.trim()) continue;
    const type = VALID_TYPES.includes(mem.type || "") ? (mem.type as any) : "general";
    const title = (mem.title || mem.content.slice(0, 60)).slice(0, 120);
    const embedding = await embedder.embed(`${title}. ${mem.content}`);

    const memory = createMemory({
      project_id: projectId,
      type,
      title,
      content: mem.content,
      embedding,
      tags: Array.isArray(mem.tags) && mem.tags.length ? mem.tags : ["conversation"],
      metadata: { source: "conversation-capture", model: llmModel() },
      importance: 0.6
    });

    stored.push({ id: memory.id, type, title, content: mem.content, tags: Array.isArray(mem.tags) ? mem.tags : ["conversation"] });
  }

  recordLog({
    action: "conversation_captured",
    entityType: "memory",
    projectId,
    summary: `Capture percakapan: +${stored.length} memori${projectName ? ` (${projectName})` : ""}`,
    source: body.project_id ? "dashboard" : "agent",
    metadata: { extracted: stored.length, model: llmModel() }
  });

  return {
    success: true,
    extracted: stored.length,
    memories: stored,
    project: projectName,
    model: llmModel()
  };
}
