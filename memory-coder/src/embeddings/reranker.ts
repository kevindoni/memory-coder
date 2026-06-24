import { cosineSimilarity } from "./index.js";

export interface RerankCandidate {
  id: string;
  content: string;
  title: string;
  similarity?: number;
  score?: number;
  importance?: number;
  access_count?: number;
  useful_count?: number;
  not_useful_count?: number;
  created_at?: string;
}

/**
 * Re-rank candidates using a multi-signal scoring function.
 *
 * Because we cannot load a cross-encoder model locally without heavy deps,
 * we use a lightweight composite score that combines:
 *   1. Semantic similarity (embedding cosine) — primary signal
 *   2. Query-term overlap (exact keyword hits in title/content) — precision boost
 *   3. Utility signal (human feedback: useful vs not-useful) — learning loop
 *   4. Recency decay (newer memories favored) — freshness / anti-stale
 *   5. Importance & access signals — quality boost
 *
 * Output `score` is the blended relevance; `confidence` is a 0..1 trust estimate
 * derived from how much feedback/recency backs the memory.
 */
export function rerank(
  query: string,
  candidates: RerankCandidate[],
  queryEmbedding: Float32Array,
  opts?: { candidateEmbeddings?: Map<string, Float32Array>; topK?: number }
): Array<{ id: string; score: number; similarity: number; rerankScore: number; confidence: number; utility: number; overlap: number; recency: number }> {
  const topK = opts?.topK ?? candidates.length;
  const qTokens = new Set(
    query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  const now = Date.now();
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

  const scored = candidates.map((c) => {
    const emb = opts?.candidateEmbeddings?.get(c.id);
    const sim = emb ? cosineSimilarity(queryEmbedding, emb) : c.similarity ?? 0;

    // keyword overlap (0..1): fraction of query tokens found in title+content
    const text = `${c.title} ${c.content}`.toLowerCase();
    let hits = 0;
    for (const t of qTokens) if (text.includes(t)) hits++;
    const overlap = qTokens.size > 0 ? hits / qTokens.size : 0;

    // utility from feedback: net useful votes squashed into 0..1 around 0.5
    const useful = c.useful_count ?? 0;
    const notUseful = c.not_useful_count ?? 0;
    const utility = sigmoid((useful - notUseful) * 0.8); // 0..1, neutral=0.5

    // recency decay: 1.0 today, ~0.5 over ~1 year, floor 0.3
    let recency = 1;
    if (c.created_at) {
      const ageDays = (now - new Date(c.created_at).getTime()) / 86_400_000;
      recency = Math.max(0.3, Math.exp(-ageDays / 365));
    }

    const importance = c.importance ?? 0.5;
    // access frequency: genuinely more-accessed memories are slightly more trusted
    const access = 1 + Math.min(0.15, (c.access_count || 0) * 0.015);

    const composite =
      0.5 * sim +
      0.18 * overlap +
      0.14 * utility +
      0.1 * recency +
      0.05 * importance +
      0.03 * Math.min(1, (access - 1) / 0.15);

    // confidence: how much non-semantic evidence backs this memory (0..1)
    const confidence = Math.max(0, Math.min(1, 0.4 * utility + 0.3 * recency + 0.2 * importance + 0.1 * overlap));

    return { id: c.id, score: composite, similarity: sim, rerankScore: composite, confidence, utility, overlap, recency };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored.slice(0, topK);
}
