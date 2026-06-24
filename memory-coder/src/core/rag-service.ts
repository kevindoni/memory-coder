import { cosineSimilarity, getEmbedder } from "../embeddings/index.js";
import { getVectorStore } from "../embeddings/vector-store.js";
import { getBM25Index, reciprocalRankFusion } from "../embeddings/bm25.js";
import { rerank } from "../embeddings/reranker.js";
import { getMemoriesByIds, getMemoriesByProject, getAllMemories, getProject, updateProjectLastActive } from "../db/index.js";
import { chatCompletion, ChatMessage, llmConfigured, llmModel } from "./llm-service.js";
import { recordLog } from "./log-service.js";

interface AskArgs {
  question: string;
  project_id?: string | null;
  project_name?: string | null;
  history?: ChatMessage[];
  top_k?: number;
}

/**
 * RAG Q&A with hybrid retrieval + re-ranking.
 *
 * Pipeline:
 *   1. Embed question
 *   2. Hybrid retrieval: semantic (vector store) + BM25 keyword → RRF fusion
 *   3. Re-rank candidates by multi-signal composite score
 *   4. Build context from top-K memories (configurable, default 8)
 *   5. Generate answer via LLM with cited sources
 */
export async function askService(args: unknown) {
  const { question, project_id, project_name, history, top_k = 8 } = args as AskArgs;

  if (!question || !question.trim()) {
    return { success: false, error: "question wajib diisi" };
  }
  if (!llmConfigured()) {
    return {
      success: false,
      error: "OpenRouter belum dikonfigurasi. Set OPENROUTER_API_KEY di file .env lalu restart."
    };
  }

  // resolve project scope
  let projectId: string | null = null;
  let projectName: string | null = null;
  let scopePool: Set<string> | null = null;

  if (project_id) {
    projectId = project_id;
    const p = getProject(project_id);
    projectName = p?.name ?? null;
  } else if (project_name) {
    const p = getProject(project_name);
    if (p) {
      projectId = p.id;
      projectName = p.name;
      updateProjectLastActive(p.id);
    }
  }

  if (projectId) {
    const projectMemories = getMemoriesByProject(projectId, 5000);
    scopePool = new Set(projectMemories.map((m) => m.id));
  }

  // ---- Hybrid retrieval ----
  const embedder = getEmbedder();
  const qEmbedding = await embedder.embed(question);

  const candidatePool = Math.max(top_k * 4, 30);

  // semantic search
  const semanticRaw = getVectorStore().search(qEmbedding, candidatePool);
  const semantic = scopePool
    ? semanticRaw.filter((r) => scopePool!.has(r.id))
    : semanticRaw;

  // bm25 keyword search
  const keyword = getBM25Index().search(question, candidatePool, scopePool || undefined);

  // reciprocal rank fusion
  const fused = keyword.length > 0
    ? reciprocalRankFusion(semantic, keyword)
    : semantic.map((r) => ({ id: r.id, score: r.similarity }));

  if (fused.length === 0) {
    // no memories at all — still let the LLM answer honestly
    const scopeLabel = projectName ? `project "${projectName}"` : "semua project";
    const answer = await chatCompletion(
      [
        { role: "system", content: `Kamu adalah asisten AI memory-coder dengan akses ke memori ${scopeLabel}. Tidak ada memori relevan ditemukan. Jawab jujur bahwa kamu belum punya konteks, lalu beri saran umum. Jawab ringkas dalam bahasa yang sama dengan user.` },
        { role: "user", content: question }
      ],
      { temperature: 0.3, maxTokens: 512 }
    );
    return { success: true, answer, question, model: llmModel(), project: projectName, sources: [] };
  }

  // ---- Re-ranking ----
  const topCandidateIds = fused.slice(0, Math.min(candidatePool, fused.length)).map((f) => f.id);
  let candidateMemories = getMemoriesByIds(topCandidateIds).filter((m) => !m.superseded_by);
  if (candidateMemories.length === 0) candidateMemories = getMemoriesByIds(topCandidateIds);
  const candMap = new Map<string, Float32Array>();
  for (const m of candidateMemories) {
    if (m.embedding) candMap.set(m.id, m.embedding);
  }

  const reranked = rerank(question, candidateMemories as any, qEmbedding, {
    candidateEmbeddings: candMap,
    topK: top_k
  });

  const finalIds = reranked.map((r) => r.id);
  const finalMemories = getMemoriesByIds(finalIds);
  const memoryMap = new Map(finalMemories.map((m) => [m.id, m]));

  const ranked = reranked
    .map((r) => memoryMap.get(r.id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  // ---- Build context ----
  const context = ranked
    .map((m, i) => `[${i + 1}] (${Math.round(reranked[i].similarity * 100)}% match · ${m.type}) ${m.title}\n${m.content}`)
    .join("\n\n");

  const scopeLabel = projectName ? `project "${projectName}"` : "semua project";

  // include project metadata (description + tech stack) when scoped
  let projectInfo = "";
  if (projectId) {
    const p = getProject(projectId);
    if (p) {
      projectInfo =
        `=== INFO PROJECT ===\nNama: ${p.name}\n` +
        (p.description ? `Deskripsi: ${p.description}\n` : "") +
        (p.tech_stack?.length ? `Tech stack: ${p.tech_stack.join(", ")}\n` : "");
    }
  }

  const systemPrompt =
    `Kamu adalah asisten AI memory-coder dengan akses ke memori ${scopeLabel}. ` +
    `Jawab pertanyaan user BERDASARKAN INFO PROJECT + MEMORI yang tersedia di bawah. ` +
    `Jika informasi cukup, jawab dengan jelas dan faktual. Jika tidak cukup, bilang jujur lalu beri saran. ` +
    `Sertakan nomor referensi [1], [2] dst saat mengutip memori. Jawab ringkas dalam bahasa yang sama dengan user.\n\n` +
    `${projectInfo}` +
    `=== MEMORI RELEVAN ===\n${context || "(tidak ada memori relevan ditemukan)"}`;

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...(history || []), { role: "user", content: question }];

  const answer = await chatCompletion(messages, { temperature: 0.3, maxTokens: 1024 });

  recordLog({
    action: "ai_ask",
    entityType: "memory",
    projectId,
    summary: `Ask AI: "${question.slice(0, 80)}"`,
    source: "dashboard",
    metadata: { model: llmModel(), sources: ranked.length, mode: "hybrid+rerank" }
  });

  return {
    success: true,
    answer,
    question,
    model: llmModel(),
    project: projectName,
    sources: ranked.map((m, i) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      similarity: Math.round(reranked[i].similarity * 1000) / 1000
    }))
  };
}

export async function llmStatusService() {
  return { success: true, configured: llmConfigured(), model: llmModel() };
}
