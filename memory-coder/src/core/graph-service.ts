import { getAllMemories, getAllProjects, getMemoryById, getProject, Memory } from "../db/index.js";
import { recordLog } from "./log-service.js";

/**
 * Lightweight knowledge-graph layer (entity co-occurrence).
 *
 * Entities are extracted on-the-fly from memory text + tags using simple
 * heuristics (code refs, PascalCase, acronyms, backtick tokens). No schema
 * change required. Two capabilities:
 *   1. relatedMemories(id) — graph neighbours sharing entities with a memory.
 *   2. suggestPatterns(project) — transfer high-utility patterns/decisions
 *      from OTHER projects that share tags/tech with the target project.
 */

const STOP = new Set([
  "the","and","for","pro","app","api","web","with","from","that","this","using","use","into","your",
  "yang","dan","untuk","dari","ke","di","atau","pada","dengan","akan","adalah","tidak","jika","saat","itu","ini",
  "function","const","let","var","return","import","export","class","void","true","false","null","undefined"
]);

function extractEntities(m: Memory): Set<string> {
  const text = `${m.title} ${m.content} ${m.tags.join(" ")}`;
  const ents = new Set<string>();
  for (const t of m.tags) if (t.length >= 2) ents.add(t.toLowerCase());

  for (const match of text.matchAll(/`([^`]{2,40})`/g)) ents.add(match[1].trim().toLowerCase());
  for (const match of text.matchAll(/\b([a-zA-Z][\w-]+\.[a-z]{1,6})\b/g)) ents.add(match[1].toLowerCase());
  for (const match of text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+)\b/g)) ents.add(match[1].toLowerCase());
  for (const match of text.matchAll(/\b([A-Z][A-Z]{2,})\b/g)) {
    const w = match[1].toLowerCase();
    if (!STOP.has(w)) ents.add(w);
  }
  for (const match of text.matchAll(/\b([a-zA-Z][\w-]{4,})\b/g)) {
    const w = match[1].toLowerCase();
    if (!STOP.has(w) && !/^\d+$/.test(w)) ents.add(w);
  }
  return ents;
}

interface Snapshot {
  count: number;
  maxUpdated: string;
  list: Memory[];
  ents: Map<string, Set<string>>;
}
let snap: Snapshot | null = null;

function snapshot(): Snapshot {
  const list = getAllMemories(5000);
  let maxUpdated = "";
  for (const m of list) if (m.updated_at > maxUpdated) maxUpdated = m.updated_at;
  if (snap && snap.count === list.length && snap.maxUpdated === maxUpdated) return snap;
  const ents = new Map<string, Set<string>>();
  for (const m of list) ents.set(m.id, extractEntities(m));
  snap = { count: list.length, maxUpdated, list, ents };
  return snap;
}

export function relatedMemoriesService(args: unknown) {
  const { memory_id, limit = 8, scope = "project" } = args as { memory_id: string; limit?: number; scope?: "project" | "global" };
  if (!memory_id) return { success: false, error: "memory_id wajib diisi" };
  const target = getMemoryById(memory_id);
  if (!target) return { success: false, error: `Memory not found: ${memory_id}` };

  const targetEnts = extractEntities(target);
  const s = snapshot();
  const pool = s.list.filter((m) => m.id !== target.id && !m.superseded_by && (scope === "global" || m.project_id === target.project_id));

  const scored = pool
    .map((m) => {
      const ents = s.ents.get(m.id) || new Set<string>();
      const inter: string[] = [];
      for (const e of targetEnts) if (ents.has(e)) inter.push(e);
      return { m, shared: inter.length, score: inter.length, inter };
    })
    .filter((s2) => s2.shared > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    success: true,
    memory: { id: target.id, title: target.title, type: target.type },
    related: scored.map((s2) => ({
      id: s2.m.id,
      title: s2.m.title,
      type: s2.m.type,
      project_id: s2.m.project_id,
      shared_entities: s2.score,
      shared: s2.inter.slice(0, 10)
    }))
  };
}

export function suggestPatternsService(args: unknown) {
  const { project_name, project_id, limit = 8 } = args as { project_name?: string; project_id?: string; limit?: number };
  const key = project_id || project_name;
  if (!key) return { success: false, error: "project_name atau project_id wajib diisi" };
  const project = getProject(key);
  if (!project) return { success: false, error: `Project not found: ${key}` };

  const s = snapshot();
  const targetTags = new Set<string>([
    ...(project.tech_stack || []).map((t) => t.toLowerCase()),
    ...(s.list
      .filter((m) => m.project_id === project.id)
      .flatMap((m) => m.tags)
      .map((t) => t.toLowerCase()))
  ]);

  const candidates = s.list.filter(
    (m) => m.project_id !== project.id && !m.superseded_by && (m.type === "pattern" || m.type === "decision")
  );

  const scored = candidates
    .map((m) => {
      const tags = new Set(m.tags.map((t) => t.toLowerCase()));
      let overlap = 0;
      const shared: string[] = [];
      for (const t of tags) {
        if (targetTags.has(t)) {
          overlap++;
          shared.push(t);
        }
      }
      const utility = m.useful_count - m.not_useful_count;
      const score = overlap * 2 + Math.max(0, utility) + m.access_count * 0.1;
      return { m, overlap, utility, score, shared };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  recordLog({
    action: "pattern_suggest",
    entityType: "project",
    entityId: project.id,
    projectId: project.id,
    summary: `Suggest ${scored.length} pola lintas-project untuk ${project.name}`,
    source: "agent",
    metadata: { count: scored.length, from_projects: [...new Set(scored.map((s) => s.m.project_id))].length }
  });

  const projects = new Map(getAllProjects().map((p) => [p.id, p.name]));
  return {
    success: true,
    project: project.name,
    target_tech: project.tech_stack,
    suggestions: scored.map((s) => ({
      id: s.m.id,
      title: s.m.title,
      type: s.m.type,
      content: s.m.content,
      from_project: s.m.project_id ? projects.get(s.m.project_id) ?? null : null,
      shared_tags: s.shared,
      utility: s.utility,
      score: Math.round(s.score * 100) / 100
    }))
  };
}
