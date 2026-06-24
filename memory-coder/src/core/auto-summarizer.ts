import { createMemory } from "../db/index.js";
import { getEmbedder } from "../embeddings/index.js";
import { chatCompletion, llmConfigured, llmModel } from "./llm-service.js";
import { recordLog } from "./log-service.js";

export interface CommitInfo {
  sha: string;
  author: string;
  date: string;
  message: string;
}

interface ExtractedMemory {
  type?: string;
  title?: string;
  content?: string;
  tags?: string[];
}

const VALID_TYPES = ["decision", "pattern", "learning", "bug", "general"];
const MAX_COMMITS_PER_BATCH = 30;

/**
 * Sends a batch of git commits to the LLM and extracts durable, typed memories
 * (decisions, bug fixes, patterns, learnings). Each extracted memory is stored
 * with its embedding. Falls back gracefully when the LLM is not configured.
 */
export async function summarizeCommits(
  projectId: string,
  projectName: string,
  commits: CommitInfo[]
): Promise<{ added: number; skipped: boolean; error?: string }> {
  if (!llmConfigured()) {
    return { added: 0, skipped: true, error: "LLM not configured" };
  }
  if (commits.length === 0) {
    return { added: 0, skipped: true, error: "No commits" };
  }

  const batch = commits.slice(-MAX_COMMITS_PER_BATCH);
  const commitList = batch
    .map((c, i) => `${i + 1}. [${c.sha.slice(0, 7)}] ${c.author} (${c.date}): ${c.message}`)
    .join("\n");

  const systemPrompt =
    `You are a code memory extractor for project "${projectName}". ` +
    `Analyze the git commits below and extract durable, reusable memories that a future developer or AI would find valuable. ` +
    `Classify each memory as exactly one of: decision, pattern, learning, bug, general. ` +
    `Skip trivial commits (merge, typo, formatting, version bump, "clean up") — only extract meaningful technical insights. ` +
    `Each memory must be concise but self-contained (a future reader with zero context must understand it). ` +
    `Respond ONLY with a raw JSON array — no markdown, no explanation.`;

  const userPrompt =
    `Commits to analyze:\n${commitList}\n\n` +
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
    recordLog({ action: "ai_summarized", entityType: "git", projectId, summary: `Smart summary ${projectName}: LLM error`, source: "indexer", metadata: { model: llmModel(), error: msg } });
    return { added: 0, skipped: true, error: msg };
  }

  let extracted: ExtractedMemory[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    extracted = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    recordLog({ action: "ai_summarized", entityType: "git", projectId, summary: `Smart summary ${projectName}: JSON parse gagal`, source: "indexer", metadata: { model: llmModel() } });
    return { added: 0, skipped: true, error: "JSON parse failed" };
  }

  if (!Array.isArray(extracted) || extracted.length === 0) {
    return { added: 0, skipped: true, error: "Empty extraction" };
  }

  const embedder = getEmbedder();
  const commitShas = batch.map((c) => c.sha.slice(0, 7));
  let added = 0;

  for (const mem of extracted) {
    if (!mem.content || !mem.content.trim()) continue;
    const type = VALID_TYPES.includes(mem.type || "") ? (mem.type as any) : "general";
    const title = (mem.title || mem.content.slice(0, 60)).slice(0, 120);
    const embedding = await embedder.embed(`${title}. ${mem.content}`);

    createMemory({
      project_id: projectId,
      type,
      title,
      content: mem.content,
      embedding,
      tags: Array.isArray(mem.tags) && mem.tags.length ? mem.tags : ["auto-summary"],
      metadata: { source: "auto-summary", commits: commitShas, model: llmModel() },
      importance: 0.6
    });
    added++;
  }

  recordLog({
    action: "ai_summarized",
    entityType: "git",
    projectId,
    summary: `Smart summary ${projectName}: +${added} memori dari ${batch.length} commit`,
    source: "indexer",
    metadata: { added, commits: batch.length, model: llmModel() }
  });

  return { added, skipped: false };
}
