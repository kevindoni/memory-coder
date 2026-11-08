import fs from "fs";
import path from "path";
import {
  getAllProjects,
  getProject,
  createProject,
  updateProjectLastActive,
  getAllMemories,
  getMemoryById,
  getMemoriesByIds,
  deleteMemory,
  updateMemoryProject,
  recordFeedback,
  supersedeMemory
} from "../db/index.js";
import { getVectorStore } from "../embeddings/vector-store.js";
import { recordLog } from "./log-service.js";

// ---------------------------------------------------------------------------
// CONFIG (env-overridable)
// ---------------------------------------------------------------------------
const AUTO_DETECT = process.env.MC_AUTO_DETECT !== "false"; // auto-register project from path
const DEDUP_THRESHOLD = Number(process.env.MC_DEDUP_THRESHOLD || 0.9); // real-time dedup sim >= this
const EXPIRE_DAYS = Number(process.env.MC_EXPIRE_DAYS || 180); // stale window
const EXPIRE_MIN_ACCESS = Number(process.env.MC_EXPIRE_MIN_ACCESS || 2); // max access_count to be considered stale
const EXPIRE_DRY_RUN = process.env.MC_EXPIRE_DRY_RUN !== "false"; // default: dry-run, set false to actually delete
const AUTO_RESOLVE_CONFLICTS = process.env.MC_AUTO_RESOLVE_CONFLICTS !== "false"; // auto-supersede conflicting decisions

// Path segments that must never be auto-registered as projects (temp/system/tooling dirs)
const AUTO_DETECT_DENYLIST = new Set([
  "temp", "tmp", "appdata", "windows", "system32", "node_modules", "recycle", "$recycle.bin"
]);

// Runtime stats for dashboard visibility
const SMART_STATS = {
  autoDetectedProjects: 0,
  dedupSkipped: 0,
  conflictsResolved: 0,
  importanceTuned: 0,
  staleExpired: 0,
  lastTick: null as string | null
};

export function getSmartStats() {
  return {
    config: {
      autoDetect: AUTO_DETECT,
      dedupThreshold: DEDUP_THRESHOLD,
      expireDays: EXPIRE_DAYS,
      expireMinAccess: EXPIRE_MIN_ACCESS,
      expireDryRun: EXPIRE_DRY_RUN,
      autoResolveConflicts: AUTO_RESOLVE_CONFLICTS
    },
    counters: { ...SMART_STATS }
  };
}

// ===========================================================================
// 1) AUTO-DETECT PROJECT FROM PATH
//    Given a cwd/working dir, find the registered project whose path is a
//    prefix of (or equal to) cwd. Falls back to auto-registering a new project
//    from the basename of the cwd when nothing matches.
// ===========================================================================
export function resolveProjectFromPath(cwd?: string | null, hintName?: string | null): string | null {
  if (!cwd && !hintName) return null;

  const projects = getAllProjects();

  // Exact name hint first (fast path)
  if (hintName) {
    const byName = projects.find((p) => p.name.toLowerCase() === hintName.toLowerCase());
    if (byName) {
      updateProjectLastActive(byName.id);
      return byName.id;
    }
  }

  if (cwd) {
    const normalizedCwd = path.resolve(cwd).toLowerCase().replace(/\\/g, "/");
    // Longest matching path prefix wins (most specific project)
    let best: { id: string; len: number } | null = null;
    for (const p of projects) {
      const normPath = path.resolve(p.path).toLowerCase().replace(/\\/g, "/");
      if (normalizedCwd === normPath || normalizedCwd.startsWith(normPath + "/")) {
        if (!best || normPath.length > best.len) best = { id: p.id, len: normPath.length };
      }
    }
    if (best) {
      updateProjectLastActive(best.id);
      return best.id;
    }
  }

  // Auto-register a new project from the cwd basename (if enabled)
  if (AUTO_DETECT && cwd) {
    const resolved = path.resolve(cwd);
    const segments = resolved.toLowerCase().replace(/\\/g, "/").split("/").filter(Boolean);
    const denied = segments.some((s) => AUTO_DETECT_DENYLIST.has(s) || s.startsWith("."));
    const base = path.basename(resolved);
    if (!denied && base && base !== "/" && base !== "") {
      const existing = getProject(base);
      if (existing) {
        updateProjectLastActive(existing.id);
        return existing.id;
      }
      const project = createProject({
        name: base,
        path: path.resolve(cwd),
        tech_stack: [],
        description: `Auto-detected from ${cwd}`
      });
      recordLog({
        action: "project_auto_detected",
        entityType: "project",
        entityId: project.id,
        projectId: project.id,
        summary: `Project otomatis dideteksi: ${project.name} (${cwd})`,
        source: "smart-manager",
        metadata: { name: project.name, path: project.path }
      });
      SMART_STATS.autoDetectedProjects++;
      return project.id;
    }
  }

  return null;
}

// ===========================================================================
// 2) AUTO-DEDUP REAL-TIME
//    Before creating a memory, check for a near-duplicate in the same project.
//    Returns the existing memory id if it should be considered a duplicate.
// ===========================================================================
export function findDuplicate(
  embedding: Float32Array,
  projectId: string | null
): { id: string; title: string; similarity: number } | null {
  const store = getVectorStore();
  if (store.size === 0) return null;

  const simHits = store.search(embedding, 8);
  if (simHits.length === 0) return null;

  const hitsMem = getMemoriesByIds(simHits.map((h) => h.id));
  const byId = new Map(hitsMem.map((m) => [m.id, m]));

  let best: { id: string; title: string; similarity: number } | null = null;
  for (const h of simHits) {
    const m = byId.get(h.id);
    if (!m || m.superseded_by) continue;
    if (projectId && m.project_id !== projectId) continue;
    if (h.similarity < DEDUP_THRESHOLD) continue;
    if (!best || h.similarity > best.similarity) {
      best = { id: m.id, title: m.title, similarity: h.similarity };
    }
  }
  if (best) SMART_STATS.dedupSkipped++;
  return best;
}

// ===========================================================================
// 3) AUTO-EXPIRE STALE MEMORIES
//    Memories with low importance, few accesses, and old age are archived
//    (deleted) unless MC_EXPIRE_DRY_RUN=false.
// ===========================================================================
export interface ExpireResult {
  scanned: number;
  expired: string[];
  dryRun: boolean;
  reason: string;
}

export function expireStaleMemories(dryRun: boolean = EXPIRE_DRY_RUN): ExpireResult {
  const all = getAllMemories(100_000);
  const now = Date.now();
  const expired: string[] = [];
  let scanned = 0;

  for (const m of all) {
    if (m.superseded_by) continue; // already versioned out
    if (m.importance >= 0.7) continue; // keep important memories
    if ((m.access_count || 0) > EXPIRE_MIN_ACCESS) continue; // keep frequently used
    if ((m.useful_count || 0) > 0) continue; // keep positively rated

    const ageDays = (now - new Date(m.created_at).getTime()) / 86_400_000;
    if (ageDays < EXPIRE_DAYS) continue;

    scanned++;
    if (!dryRun) {
      if (deleteMemory(m.id)) expired.push(m.id);
    } else {
      expired.push(m.id); // count-only in dry run
    }
  }

  const reason = `importance<0.7 & access<=${EXPIRE_MIN_ACCESS} & age>=${EXPIRE_DAYS}d & no positive feedback`;
  if (expired.length > 0) {
    recordLog({
      action: "expire_stale",
      entityType: "memory",
      projectId: null,
      summary: `Auto-expire: ${expired.length} memori${dryRun ? " (dry-run)" : ""} — ${reason}`,
      source: "smart-manager",
      metadata: { scanned, expired: expired.length, dryRun, reason }
    });
  }

  return { scanned, expired, dryRun, reason };
}

// ===========================================================================
// 4) AUTO-IMPORTANCE TUNING
//    Recompute a memory's importance from feedback + access signals.
//    Called after feedback and on a background tick.
// ===========================================================================
export function tuneImportance(memoryId: string): number | null {
  const m = getMemoryById(memoryId);
  if (!m) return null;

  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

  // Base from feedback net votes
  const feedbackSignal = sigmoid((m.useful_count - m.not_useful_count) * 0.5); // 0..1
  // Access frequency contributes modestly
  const accessSignal = Math.min(1, (m.access_count || 0) / 20);
  // Original importance acts as a prior
  const prior = m.importance ?? 0.5;

  // Blend: 50% prior, 30% feedback, 20% access
  const tuned = 0.5 * prior + 0.3 * feedbackSignal + 0.2 * accessSignal;
  const clamped = Math.max(0.1, Math.min(1, tuned));

  if (Math.abs(clamped - (m.importance ?? 0.5)) > 0.01) {
    updateMemoryImportance(memoryId, clamped);
    SMART_STATS.importanceTuned++;
  }
  return clamped;
}

export function retuneAllImportance(limit = 1000): number {
  const all = getAllMemories(limit);
  let tuned = 0;
  for (const m of all) {
    if (m.useful_count > 0 || m.not_useful_count > 0 || (m.access_count || 0) >= 5) {
      tuneImportance(m.id);
      tuned++;
    }
  }
  if (tuned > 0) {
    recordLog({
      action: "retune_importance",
      entityType: "memory",
      projectId: null,
      summary: `Re-tune importance: ${tuned} memori diproses`,
      source: "smart-manager",
      metadata: { tuned }
    });
  }
  return tuned;
}

// Local importance setter (kept here to avoid import cycle with db write helper)
import { getDb, scheduleSave } from "../db/index.js";
function updateMemoryImportance(id: string, importance: number): void {
  const db = getDb();
  db.run(`UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?`, [
    importance,
    new Date().toISOString(),
    id
  ]);
  scheduleSave();
}

// ===========================================================================
// 5) CONFLICT AUTO-RESOLVE (decisions)
//    For a decision memory, find an older conflicting decision in the same
//    project and supersede it (versioning). Returns the superseded id.
// ===========================================================================
export function autoResolveConflicts(
  newMemoryId: string,
  embedding: Float32Array,
  projectId: string | null
): { superseded: string | null; similarity: number } {
  if (!AUTO_RESOLVE_CONFLICTS || embedding.length === 0) {
    return { superseded: null, similarity: 0 };
  }

  const store = getVectorStore();
  if (store.size === 0) return { superseded: null, similarity: 0 };

  const simHits = store.search(embedding, 5);
  const hitsMem = getMemoriesByIds(simHits.map((h) => h.id));
  const byId = new Map(hitsMem.map((m) => [m.id, m]));

  // Conflict band: similar but not identical decision (0.75 .. 0.95).
  // >=0.95 is handled upstream as exact-duplicate dedup (existing kept).
  const CONFLICT_LO = 0.75;
  const CONFLICT_HI = 0.95;

  for (const h of simHits) {
    const m = byId.get(h.id);
    if (!m || m.superseded_by) continue;
    if (m.id === newMemoryId) continue;
    if (m.type !== "decision") continue;
    if (projectId && m.project_id !== projectId) continue;
    if (h.similarity >= CONFLICT_LO && h.similarity <= CONFLICT_HI) {
      supersedeMemory(m.id, newMemoryId);
      recordLog({
        action: "conflict_auto_resolved",
        entityType: "memory",
        entityId: m.id,
        projectId,
        summary: `Decision conflict auto-resolved: ${m.title} → ${newMemoryId} (sim=${h.similarity.toFixed(2)})`,
        source: "smart-manager",
        metadata: { oldId: m.id, newId: newMemoryId, similarity: h.similarity }
      });
      SMART_STATS.conflictsResolved++;
      return { superseded: m.id, similarity: h.similarity };
    }
  }

  return { superseded: null, similarity: 0 };
}

// ===========================================================================
// 6) AUTO-SCOPE UNSCOPED MEMORIES
//    Find memories with project_id=null, match them to a registered project
//    by inspecting content/title for project name mentions or path hints.
// ===========================================================================
export interface AutoScopeResult {
  scanned: number;
  scoped: number;
  dryRun: boolean;
}

export function autoScopeUnscoped(dryRun = true): AutoScopeResult {
  const db = getDb();
  const stmt = db.prepare(`SELECT id, title, content, metadata FROM memories WHERE project_id IS NULL AND superseded_by IS NULL ORDER BY created_at DESC LIMIT 5000`);
  const rows: Array<{ id: string; title: string; content: string; metadata: string }> = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();

  const projects = getAllProjects();
  let scoped = 0;

  for (const row of rows) {
    const text = `${row.title} ${row.content} ${row.metadata || ""}`.toLowerCase();
    // Longest name match wins (avoid short names matching everything)
    let best: { id: string; len: number } | null = null;
    for (const p of projects) {
      const n = p.name.toLowerCase();
      if (n.length >= 3 && text.includes(n)) {
        if (!best || n.length > best.len) best = { id: p.id, len: n.length };
      }
      // Also match by path fragment
      const pathFrag = path.basename(p.path).toLowerCase();
      if (pathFrag.length >= 3 && text.includes(pathFrag)) {
        if (!best || pathFrag.length > best.len) best = { id: p.id, len: pathFrag.length };
      }
    }
    if (best) {
      if (!dryRun) updateMemoryProject(row.id, best.id);
      scoped++;
    }
  }

  if (scoped > 0) {
    recordLog({
      action: "auto_scope_unscoped",
      entityType: "memory",
      projectId: null,
      summary: `Auto-scope unscoped: ${scoped}/${rows.length}${dryRun ? " (dry-run)" : ""}`,
      source: "smart-manager",
      metadata: { scanned: rows.length, scoped, dryRun }
    });
  }

  return { scanned: rows.length, scoped, dryRun };
}

// ===========================================================================
// BACKGROUND TICK — runs periodic maintenance
// ===========================================================================
let tickTimer: ReturnType<typeof setInterval> | null = null;
export function startSmartManager(intervalMin = 60): void {
  if (tickTimer) return;
  const ms = intervalMin * 60_000;
  console.error(`[smart-manager] maintenance setiap ${intervalMin} menit (expire dry-run=${EXPIRE_DRY_RUN}, auto-resolve=${AUTO_RESOLVE_CONFLICTS})`);
  tickTimer = setInterval(() => {
    try {
      const exp = expireStaleMemories();
      SMART_STATS.staleExpired += exp.expired.length;
      retuneAllImportance();
      autoScopeUnscoped(false); // auto-scope is always applied (safe, reversible)
      SMART_STATS.lastTick = new Date().toISOString();
    } catch (e) {
      console.error("[smart-manager] tick error:", e instanceof Error ? e.message : String(e));
    }
  }, ms);
}
