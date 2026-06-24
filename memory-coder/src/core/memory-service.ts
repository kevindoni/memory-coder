import { z } from "zod";
import {
  createProject,
  getAllMemories,
  getMemoriesByProject,
  getProject,
  updateProjectLastActive,
  createMemory,
  getMemoriesByIds,
  getMemoryById,
  incrementAccessCount,
  recordFeedback,
  supersedeMemory,
  Memory
} from "../db/index.js";
import { cosineSimilarity, getEmbedder } from "../embeddings/index.js";
import { getVectorStore } from "../embeddings/vector-store.js";
import { getBM25Index, reciprocalRankFusion } from "../embeddings/bm25.js";
import { rerank } from "../embeddings/reranker.js";
import { recordLog } from "./log-service.js";

export const CreateProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  tech_stack: z.array(z.string()).optional(),
  description: z.string().optional()
});

export const GetProjectContextSchema = z.object({
  project_id: z.string().optional(),
  name: z.string().optional()
});

export const RememberSchema = z.object({
  content: z.string(),
  type: z.enum(["bug", "decision", "pattern", "learning", "general"]),
  project_id: z.string().optional(),
  project_name: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  force: z.boolean().optional()
});

export const FeedbackSchema = z.object({
  memory_id: z.string(),
  useful: z.boolean(),
  note: z.string().optional()
});

export const RecallSchema = z.object({
  query: z.string(),
  project_id: z.string().nullable().optional(),
  project_name: z.string().nullable().optional(),
  type: z.enum(["bug", "decision", "pattern", "learning", "general"]).optional(),
  limit: z.number().optional(),
  // new tuning options
  candidate_pool: z.number().optional(),
  hybrid: z.boolean().optional(),
  reranking: z.boolean().optional()
});

export const LogBugSchema = z.object({
  error: z.string(),
  context: z.string(),
  solution: z.string(),
  project_id: z.string().optional(),
  project_name: z.string().optional()
});

export async function createProjectService(args: unknown) {
  const { name, path, tech_stack = [], description = "" } = CreateProjectSchema.parse(args);
  const existing = getProject(name);

  if (existing) {
    updateProjectLastActive(existing.id);
    return { success: true, project: existing, message: "Project already exists, updated last_active" };
  }

  const project = createProject({ name, path, tech_stack, description });
  recordLog({ action: "project_created", entityType: "project", entityId: project.id, projectId: project.id, summary: `Project dibuat: ${name}`, source: "agent", metadata: { name, path } });
  return { success: true, project, message: "Project created successfully" };
}

export async function getProjectContextService(args: unknown) {
  const { project_id, name } = GetProjectContextSchema.parse(args);
  const projectName = project_id || name;

  if (!projectName) {
    return { success: false, error: "Either project_id or name is required" };
  }

  const project = getProject(projectName);
  if (!project) {
    return { success: false, error: `Project not found: ${projectName}` };
  }

  updateProjectLastActive(project.id);
  const recentMemories = getMemoriesByProject(project.id, 10);

  return {
    success: true,
    project,
    recent_memories: recentMemories.map(summarizeMemory)
  };
}

export async function rememberService(args: unknown) {
  const parsed = RememberSchema.parse(args);
  const projectId = resolveProjectId(parsed.project_id, parsed.project_name);
  const embedder = getEmbedder();
  const fullText = parsed.title ? `${parsed.title}. ${parsed.content}` : parsed.content;
  const embedding = await embedder.embed(fullText);

  // Conflict guardian: detect near-duplicate / superseding memory (same project).
  const store = getVectorStore();
  let conflict: { id: string; title: string; similarity: number; type: string } | null = null;
  if (parsed.type === "decision" && store.size > 0) {
    const simHits = store.search(embedding, 5);
    const hitsMem = getMemoriesByIds(simHits.map((h) => h.id));
    for (const h of simHits) {
      const m = hitsMem.find((x) => x.id === h.id);
      if (!m || m.superseded_by) continue;
      if (projectId && m.project_id !== projectId) continue;
      if (h.similarity >= 0.9) {
        conflict = { id: m.id, title: m.title, similarity: h.similarity, type: m.type };
        break;
      }
    }
  }

  // Exact duplicate (>0.95) and not forced → keep existing, skip creation (dedup).
  if (conflict && conflict.similarity >= 0.95 && !parsed.force) {
    recordLog({ action: "memory_deduped", entityType: "memory", entityId: conflict.id, projectId, summary: `Duplikat dilewati: ${conflict.title}`, source: "agent", metadata: { similarity: conflict.similarity } });
    return {
      success: true,
      memory: { id: conflict.id, type: conflict.type as Memory["type"], title: conflict.title },
      message: "Duplicate detected; existing memory kept (pass force:true to override)",
      duplicate_of: conflict.id,
      similarity: conflict.similarity
    };
  }

  const memory = createMemory({
    project_id: projectId,
    type: parsed.type,
    title: parsed.title || parsed.content.substring(0, 50),
    content: parsed.content,
    embedding,
    tags: parsed.tags || [],
    metadata: parsed.metadata || {},
    importance: 0.5
  });

  // Related-but-updated (0.9..0.95): supersede the older one (versioning), keep both linked.
  let superseded: { id: string; title: string; similarity: number } | null = null;
  if (conflict && conflict.similarity < 0.95) {
    supersedeMemory(conflict.id, memory.id);
    superseded = { id: conflict.id, title: conflict.title, similarity: conflict.similarity };
    recordLog({ action: "memory_superseded", entityType: "memory", entityId: conflict.id, projectId, summary: `Ditinakhtuilirkan oleh ${memory.id}: ${conflict.title}`, source: "agent", metadata: { new_id: memory.id, similarity: conflict.similarity } });
  }

  recordLog({ action: "memory_created", entityType: "memory", entityId: memory.id, projectId, summary: `[${parsed.type}] ${memory.title}`, source: "agent", metadata: { type: parsed.type, via: "remember", superseded: superseded?.id ?? null } });

  return {
    success: true,
    memory: {
      id: memory.id,
      type: memory.type,
      title: memory.title,
      tags: memory.tags
    },
    message: superseded ? "Memory stored; older version superseded" : "Memory stored successfully",
    superseded
  };
}

/**
 * Record explicit feedback on a memory's usefulness. This is the learning loop:
 * useful memories rise in recall, unhelpful ones sink.
 */
export async function feedbackService(args: unknown) {
  const parsed = FeedbackSchema.parse(args);
  const before = getMemoryById(parsed.memory_id);
  if (!before) return { success: false, error: `Memory not found: ${parsed.memory_id}` };
  const counts = recordFeedback(parsed.memory_id, parsed.useful);
  if (!counts) return { success: false, error: `Memory not found: ${parsed.memory_id}` };
  recordLog({
    action: "memory_feedback",
    entityType: "memory",
    entityId: parsed.memory_id,
    projectId: before.project_id,
    summary: `Feedback ${parsed.useful ? "useful" : "not-useful"}: ${before.title}`,
    source: "agent",
    metadata: { useful: parsed.useful, note: parsed.note ?? null, useful_count: counts.useful_count, not_useful_count: counts.not_useful_count }
  });
  return {
    success: true,
    memory_id: parsed.memory_id,
    useful: parsed.useful,
    useful_count: counts.useful_count,
    not_useful_count: counts.not_useful_count,
    message: parsed.useful ? "Marked useful — will rank higher" : "Marked not-useful — will rank lower"
  };
}

/**
 * Hybrid semantic + keyword search with optional re-ranking.
 *
 * Pipeline:
 *   1. Embed query
 *   2. Semantic search via vector store (ANN) — retrieves `candidate_pool` candidates
 *   3. BM25 keyword search — retrieves `candidate_pool` candidates
 *   4. Reciprocal Rank Fusion merges both lists
 *   5. Optional re-ranking with multi-signal composite score
 *   6. Hydrate final ids to full memory rows, apply type filter, return top `limit`
 *
 * Falls back gracefully: if vector store is empty, uses DB scan; hybrid/rerank
 * can be disabled per-query for speed.
 */
export async function recallService(args: unknown) {
  const { query, project_id, project_name, type, limit = 10 } = RecallSchema.parse(args);
  const candidatePool = (args as any).candidate_pool ?? 200;
  const useHybrid = (args as any).hybrid ?? true;
  const useReranking = (args as any).reranking ?? true;

  const projectId = resolveProjectId(project_id ?? undefined, project_name ?? undefined);
  const embedder = getEmbedder();
  const queryEmbedding = await embedder.embed(query);

  if (projectId) updateProjectLastActive(projectId);

  const store = getVectorStore();

  // Build the valid id pool (project + type filter) for index scoping
  let scopePool: Set<string> | null = null;
  if (projectId) {
    const projectMemories = getMemoriesByProject(projectId, 5000);
    scopePool = new Set(projectMemories.map((m) => m.id));
  }
  if (type && scopePool) {
    const filtered = getMemoriesByIds([...scopePool]);
    scopePool = new Set(filtered.filter((m) => m.type === type).map((m) => m.id));
  } else if (type) {
    const all = getMemoriesByIds([...store.size ? [] : []]);
    // fallback: scan DB for type
    const scoped = projectId ? getMemoriesByProject(projectId!, 5000) : getAllMemories(5000);
    scopePool = new Set(scoped.filter((m) => m.type === type).map((m) => m.id));
  }

  // 1. Semantic search (vector store)
  const semanticResults = store.search(queryEmbedding, candidatePool, {
    pool: scopePool ? undefined : undefined
  });
  // apply scope filter manually for precision
  const scopedSemantic = scopePool
    ? semanticResults.filter((r) => scopePool!.has(r.id))
    : semanticResults;

  // 2. BM25 keyword search
  const bm25 = getBM25Index();
  const keywordResults = useHybrid
    ? bm25.search(query, candidatePool, scopePool || undefined)
    : [];

  // 3. Fusion
  let fused: Array<{ id: string; score: number }>;
  if (useHybrid && keywordResults.length > 0) {
    fused = reciprocalRankFusion(scopedSemantic, keywordResults);
  } else {
    fused = scopedSemantic.map((r) => ({ id: r.id, score: r.similarity }));
  }

  if (fused.length === 0) {
    return { success: true, query, results: [], total_searched: store.size };
  }

  // 4. Re-ranking (optional)
  const topCandidateIds = fused.slice(0, Math.min(candidatePool, fused.length)).map((f) => f.id);
  const candidateMemories = getMemoriesByIds(topCandidateIds).filter((m) => !m.superseded_by);

  let finalRanked: Array<{ id: string; similarity: number; score: number; confidence?: number; utility?: number; overlap?: number; recency?: number }>;
  if (useReranking) {
    const candMap = new Map<string, Float32Array>();
    for (const m of candidateMemories) {
      if (m.embedding) candMap.set(m.id, m.embedding);
    }
    finalRanked = rerank(query, candidateMemories as any, queryEmbedding, {
      candidateEmbeddings: candMap,
      topK: limit
    });
  } else {
    finalRanked = fused.slice(0, limit).map((f) => {
      const m = candidateMemories.find((cm) => cm.id === f.id);
      const utility = m ? 1 / (1 + Math.exp(-((m.useful_count - m.not_useful_count) * 0.8))) : 0.5;
      return { id: f.id, similarity: m?.embedding ? cosineSimilarity(queryEmbedding, m.embedding) : f.score, score: f.score, confidence: utility, utility };
    });
  }

  // 5. Hydrate & track access
  const finalIds = finalRanked.map((r) => r.id);
  const finalMemories = getMemoriesByIds(finalIds);
  const memoryMap = new Map(finalMemories.map((m) => [m.id, m]));
  const ranked = finalRanked
    .map((r) => memoryMap.get(r.id))
    .filter((m): m is Memory => Boolean(m));

  for (const m of ranked) incrementAccessCount(m.id);

  return {
    success: true,
    query,
    results: ranked.map((m, i) => ({
      id: m.id,
      project_id: m.project_id,
      type: m.type,
      title: m.title,
      content: m.content,
      similarity: Math.round(finalRanked[i].similarity * 1000) / 1000,
      rerank_score: Math.round(finalRanked[i].score * 1000) / 1000,
      confidence: Math.round((finalRanked[i].confidence ?? 0) * 1000) / 1000,
      utility: Math.round((finalRanked[i].utility ?? 0.5) * 1000) / 1000,
      overlap: Math.round((finalRanked[i].overlap ?? 0) * 1000) / 1000,
      recency: Math.round((finalRanked[i].recency ?? 1) * 1000) / 1000,
      useful_count: m.useful_count,
      not_useful_count: m.not_useful_count,
      access_count: m.access_count,
      tags: m.tags,
      created_at: m.created_at
    })),
    total_searched: store.size,
    mode: useHybrid ? "hybrid" : "semantic",
    reranked: useReranking
  };
}

export async function logBugService(args: unknown) {
  const { error, context, solution, project_id, project_name } = LogBugSchema.parse(args);
  const projectId = resolveProjectId(project_id, project_name);
  const content = `Error: ${error}\n\nContext: ${context}\n\nSolution: ${solution}`;
  const embedder = getEmbedder();
  const embedding = await embedder.embed(content);

  const memory = createMemory({
    project_id: projectId,
    type: "bug",
    title: error.substring(0, 100),
    content,
    embedding,
    tags: ["bug", "solved"],
    metadata: { error, context, solution },
    importance: 0.8
  });

  recordLog({ action: "bug_logged", entityType: "memory", entityId: memory.id, projectId, summary: `[bug] ${error.substring(0, 80)}`, source: "agent", metadata: { error } });

  return {
    success: true,
    memory: {
      id: memory.id,
      type: memory.type,
      title: memory.title,
      error: error.substring(0, 100)
    },
    message: "Bug logged successfully - won't forget this one!"
  };
}

function resolveProjectId(projectId?: string, projectName?: string): string | null {
  if (projectId) return projectId;
  if (!projectName) return null;

  const project = getProject(projectName);
  if (!project) return null;

  updateProjectLastActive(project.id);
  return project.id;
}

function summarizeMemory(memory: Memory) {
  return {
    type: memory.type,
    title: memory.title,
    content: memory.content.substring(0, 200) + (memory.content.length > 200 ? "..." : ""),
    tags: memory.tags,
    updated_at: memory.updated_at
  };
}
