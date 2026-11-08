import {
  countMemories,
  createMemory,
  deleteMemory,
  deleteProject,
  getAllMemories,
  getAllProjects,
  getMemoryById,
  getStats,
  getSupersedeChain,
  Memory,
  MemoryFilter,
  searchMemories,
  supersedeMemory,
  updateEmbedding,
  updateMemoryProject,
  updateProject
} from "../db/index.js";
import { countLogs, getLogs, LogFilter } from "../db/index.js";
import { getEmbedder } from "../embeddings/index.js";
import { indexProjectGit, smartSummaryProject } from "./git-indexer.js";
import { recordLog } from "./log-service.js";
import { getSmartStats, expireStaleMemories, autoScopeUnscoped } from "./smart-manager.js";

function normalizeFilter(raw: Record<string, unknown>): MemoryFilter {
  const filter: MemoryFilter = {};
  const projectIdRaw = raw.project_id as string | undefined;
  if (projectIdRaw !== undefined) {
    filter.projectId = projectIdRaw === "" || projectIdRaw === "null" ? null : projectIdRaw;
  }
  const typeRaw = raw.type as string | undefined;
  if (typeRaw) filter.type = typeRaw;
  const searchRaw = raw.search as string | undefined;
  if (searchRaw) filter.search = searchRaw;
  if (raw.limit !== undefined) filter.limit = Number(raw.limit);
  if (raw.offset !== undefined) filter.offset = Number(raw.offset);
  return filter;
}

export async function statsService() {
  return { success: true, ...getStats() };
}

export async function smartStatusService() {
  return { success: true, ...getSmartStats() };
}

export async function smartExpireService(args: { apply?: boolean } = {}) {
  const apply = Boolean(args.apply);
  const result = expireStaleMemories(!apply);
  return { success: true, ...result, applied: apply };
}

export async function smartScopeService(args: { apply?: boolean } = {}) {
  const dryRun = !Boolean(args.apply);
  const result = autoScopeUnscoped(dryRun);
  return { success: true, ...result, applied: !dryRun };
}

export async function updateMemoryService(id: string, args: { project_id?: string | null; superseded_by?: string | null } = {}) {
  const hasProject = "project_id" in args;
  const hasSupersede = "superseded_by" in args;
  if (!hasProject && !hasSupersede) {
    return { success: false, error: "Nothing to update: provide project_id or superseded_by" };
  }
  if (!getMemoryById(id)) return { success: false, error: `Memory not found: ${id}` };
  if (hasProject) {
    const ok = updateMemoryProject(id, args.project_id ?? null);
    if (!ok) return { success: false, error: `Memory not found: ${id}` };
    recordLog({
      action: "memory_rescoped",
      entityType: "memory",
      entityId: id,
      projectId: args.project_id ?? null,
      summary: `Memory re-scoped to project ${args.project_id ?? "(unscoped)"}`,
      source: "admin"
    });
  }
  if (hasSupersede) {
    const by = args.superseded_by ?? null;
    if (by) {
      if (!getMemoryById(by)) return { success: false, error: `Superseding memory not found: ${by}` };
      if (by === id) return { success: false, error: "Cannot supersede itself" };
      supersedeMemory(id, by);
      recordLog({
        action: "memory_superseded",
        entityType: "memory",
        entityId: id,
        projectId: null,
        summary: `Superseded by ${by}`,
        source: "admin"
      });
    }
  }
  return { success: true, memory: getMemoryById(id) };
}

export async function listProjectsService() {
  return { success: true, projects: getAllProjects() };
}

export async function listMemoriesService(query: Record<string, unknown>) {
  const filter = normalizeFilter(query);
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const memories = searchMemories({ ...filter, limit, offset }).map(stripEmbedding);
  const total = countMemories(filter);
  return { success: true, memories, total, limit, offset };
}

function stripEmbedding(m: any) {
  const { embedding, ...rest } = m;
  return rest;
}

export async function getMemoryService(id: string) {
  const memory = getMemoryById(id);
  if (!memory) return { success: false, error: "Memory not found" };
  return { success: true, memory };
}

/**
 * Re-compute embeddings for all (or a limited sample of) memories with the
 * currently-loaded embedder. Run this after switching EMBEDDING_MODEL so stored
 * vectors match the new model. Idempotent and safe (content is unchanged).
 */
export async function reembedService(args: unknown) {
  const { limit = 0 } = (args || {}) as { limit?: number };
  const embedder = getEmbedder();
  const all = getAllMemories(limit && limit > 0 ? limit : 100000);
  let count = 0;
  const batchSize = 16;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const texts = batch.map((m) => `${m.title}. ${m.content}`);
    const vectors = await embedder.embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      updateEmbedding(batch[j].id, vectors[j]);
      count++;
    }
  }
  recordLog({ action: "reembed_run", entityType: "memory", summary: `Re-embed ${count} memori (model=${embedder.currentModel?.()})`, source: "dashboard", metadata: { count, model: embedder.currentModel?.() } });
  return { success: true, reembedded: count, model: embedder.currentModel?.() };
}

export function embedStatusService() {
  const embedder = getEmbedder();
  return { success: true, model: embedder.currentModel?.() ?? "unknown", dim: 384 };
}

export function updateProjectService(id: string, args: unknown) {
  const { name, path, tech_stack, description } = (args || {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof path === "string") patch.path = path.trim();
  if (Array.isArray(tech_stack)) patch.tech_stack = tech_stack.map(String).filter(Boolean);
  if (typeof description === "string") patch.description = description;
  if (Object.keys(patch).length === 0) return { success: false, error: "Tidak ada field untuk diupdate" };
  const updated = updateProject(id, patch as any);
  if (!updated) return { success: false, error: "Project not found" };
  recordLog({ action: "project_updated", entityType: "project", entityId: id, summary: `Update project ${updated.name}`, source: "dashboard", metadata: patch });
  return { success: true, project: updated };
}

const STOP_W = new Set("the and for pro app api web with from that this using use into your a an of to in is are was be on at by it as or yang dan untuk dari ke di atau pada dengan akan adalah tidak jika saat itu ini function const let var return new if else then".split(" "));
function toks(s: string): Set<string> {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP_W.has(w)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Detect near-duplicate and possibly-conflicting decision memory pairs using
 * token Jaccard similarity (same logic as scripts/consolidate.cjs, in-process).
 */
export function conflictsService(args: unknown) {
  const { dupThreshold = 0.82, conflictLo = 0.4, conflictHi = 0.75, limit = 200 } = (args || {}) as Record<string, number>;
  const mems = getAllMemories(limit).filter((m) => !m.superseded_by);
  const blocks = new Map<string, Memory[]>();
  for (const m of mems) {
    const key = `${m.project_id || "null"}|${m.type}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(m);
  }
  const duplicates: Array<{ a: { id: string; title: string }; b: { id: string; title: string }; sim: number }> = [];
  const conflicts: Array<{ a: { id: string; title: string }; b: { id: string; title: string }; sim: number }> = [];
  for (const group of blocks.values()) {
    const sets = group.map((m) => ({ m, set: toks(`${m.title} ${m.content}`) }));
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const sim = jaccard(sets[i].set, sets[j].set);
        if (sim >= dupThreshold) duplicates.push({ a: { id: sets[i].m.id, title: sets[i].m.title }, b: { id: sets[j].m.id, title: sets[j].m.title }, sim: Math.round(sim * 100) / 100 });
        else if (sets[i].m.type === "decision" && sets[j].m.type === "decision" && sim >= conflictLo && sim <= conflictHi) {
          conflicts.push({ a: { id: sets[i].m.id, title: sets[i].m.title }, b: { id: sets[j].m.id, title: sets[j].m.title }, sim: Math.round(sim * 100) / 100 });
        }
      }
    }
  }
  duplicates.sort((x, y) => y.sim - x.sim);
  conflicts.sort((x, y) => y.sim - x.sim);
  return { success: true, scanned: mems.length, duplicates, conflicts, dupCount: duplicates.length, conflictCount: conflicts.length };
}

export function supersedeChainService(id: string) {
  const self = getMemoryById(id);
  if (!self) return { success: false, error: "Memory not found" };
  const chain = getSupersedeChain(id);
  return {
    success: true,
    memory: { id: self.id, title: self.title, superseded_by: self.superseded_by },
    successor: chain.successor ? { id: chain.successor.id, title: chain.successor.title } : null,
    predecessors: chain.predecessors.map((m) => ({ id: m.id, title: m.title, created_at: m.created_at }))
  };
}

function normalizeLogFilter(raw: Record<string, unknown>): LogFilter {
  const filter: LogFilter = {};
  if (raw.action) filter.action = String(raw.action);
  if (raw.source) filter.source = String(raw.source);
  if (raw.project_id) filter.projectId = String(raw.project_id);
  if (raw.search) filter.search = String(raw.search);
  if (raw.limit !== undefined) filter.limit = Number(raw.limit);
  if (raw.offset !== undefined) filter.offset = Number(raw.offset);
  return filter;
}

export async function listLogsService(query: Record<string, unknown>) {
  const filter = normalizeLogFilter(query);
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const logs = getLogs({ ...filter, limit, offset });
  const total = countLogs(filter);
  return { success: true, logs, total, limit, offset };
}

export async function addMemoryService(args: unknown) {
  const body = args as {
    type: string;
    project_id?: string | null;
    title?: string;
    content: string;
    tags?: string[];
    source?: string;
  };
  if (!body.content || !body.type) {
    return { success: false, error: "content and type are required" };
  }
  const ALLOWED = ["bug", "decision", "pattern", "learning", "general"] as const;
  const type = (ALLOWED as readonly string[]).includes(body.type) ? (body.type as (typeof ALLOWED)[number]) : "general";
  const projectId = body.project_id === undefined || body.project_id === "" ? null : body.project_id;
  const embedder = getEmbedder();
  const title = body.title || body.content.substring(0, 60);
  const embedding = await embedder.embed(title ? `${title}. ${body.content}` : body.content);

  const memory = createMemory({
    project_id: projectId,
    type,
    title,
    content: body.content,
    embedding,
    tags: body.tags || [],
    metadata: {},
    importance: 0.5
  });

  recordLog({
    action: "memory_created",
    entityType: "memory",
    entityId: memory.id,
    projectId,
    summary: `[${type}] ${title}`,
    source: body.source || "dashboard",
    metadata: { type, via: "manual" }
  });

  return { success: true, memory: { id: memory.id, type: memory.type, title: memory.title }, message: "Memory added" };
}

export async function deleteMemoryService(id: string) {
  const existing = getMemoryById(id);
  const ok = deleteMemory(id);
  if (ok && existing) {
    recordLog({ action: "memory_deleted", entityType: "memory", entityId: id, projectId: existing.project_id, summary: `Dihapus: ${existing.title}`, source: "dashboard", metadata: { type: existing.type } });
  }
  return { success: ok, message: ok ? "Memory deleted" : "Memory not found" };
}

export async function deleteProjectService(id: string) {
  const ok = deleteProject(id);
  if (ok) {
    recordLog({ action: "project_deleted", entityType: "project", entityId: id, projectId: id, summary: `Project dihapus: ${id}`, source: "dashboard", metadata: {} });
  }
  return { success: ok, message: ok ? "Project and its memories deleted" : "Project not found" };
}

export async function indexProjectService(id: string) {
  return indexProjectGit(id);
}

export async function smartSummaryService(id: string) {
  return smartSummaryProject(id);
}
