import initSqlJs, { Database } from "sql.js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { getVectorStore } from "../embeddings/vector-store.js";
import { getBM25Index } from "../embeddings/bm25.js";

export interface Project {
  id: string;
  name: string;
  path: string;
  tech_stack: string[];
  description: string;
  created_at: string;
  updated_at: string;
  last_active: string;
}

export interface Memory {
  id: string;
  project_id: string | null;
  type: "bug" | "decision" | "pattern" | "learning" | "general";
  title: string;
  content: string;
  embedding: Float32Array | null;
  tags: string[];
  metadata: Record<string, unknown>;
  importance: number;
  access_count: number;
  useful_count: number;
  not_useful_count: number;
  last_feedback_at: string | null;
  superseded_by: string | null;
  source_sha?: string | null;
  created_at: string;
  updated_at: string;
}

let db: Database | null = null;
let activeDbPath = "./data/memory.db";

// ---- Batched persistence: coalesce rapid writes into a single disk flush ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;
const SAVE_DEBOUNCE_MS = 500;
let dirtyCount = 0;
const FLUSH_THRESHOLD = 25; // force flush after this many unsaved writes

export async function initDatabase(dbPath: string = "./data/memory.db"): Promise<Database> {
  if (db) return db;

  activeDbPath = dbPath;
  const SQL = await initSqlJs();
  const fullPath = path.resolve(dbPath);

  if (fs.existsSync(fullPath)) {
    const buffer = fs.readFileSync(fullPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  createTables(db);

  // warm up in-memory indexes from existing data
  hydrateIndexes();

  // flush once at startup if the file was new
  if (!fs.existsSync(fullPath)) saveDatabase();

  return db;
}

function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      tech_stack TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_active TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      tags TEXT,
      metadata TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // Indexes for fast filtering & dedup
  database.run(`CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)`);

  // Dedup column: add 'source_sha' for robust git commit dedup (idempotent migration)
  try {
    database.run(`ALTER TABLE memories ADD COLUMN source_sha TEXT`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_memories_source_sha ON memories(source_sha)`);
  } catch {
    // column already exists
  }

  // Learning columns: feedback signals + versioning (idempotent migrations)
  try { database.run(`ALTER TABLE memories ADD COLUMN useful_count INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { database.run(`ALTER TABLE memories ADD COLUMN not_useful_count INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { database.run(`ALTER TABLE memories ADD COLUMN last_feedback_at TEXT`); } catch {}
  try {
    database.run(`ALTER TABLE memories ADD COLUMN superseded_by TEXT`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_memories_superseded ON memories(superseded_by)`);
  } catch {}

  database.run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      project_id TEXT,
      summary TEXT NOT NULL,
      source TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_logs_project ON activity_logs(project_id)`);
}

/**
 * Load all existing memories into the in-memory vector store and BM25 index
 * so search is instant after startup without a cold start.
 */
function hydrateIndexes(): void {
  if (!db) return;
  const store = getVectorStore();
  const bm25 = getBM25Index();
  store.clear();
  bm25.clear();

  const stmt = db.prepare(`SELECT id, title, content, embedding FROM memories`);
  let count = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    if (row.embedding) {
      const arr = blobToFloat32(row.embedding);
      if (arr) store.add(row.id, arr);
    }
    bm25.add(row.id, `${row.title} ${row.content}`);
    count++;
  }
  stmt.free();
  console.error(`[db] hydrated ${count} memories into vector + bm25 indexes`);
}

/**
 * Debounced disk persistence. Multiple rapid writes are coalesced into a single
 * fs.writeFileSync, dramatically reducing I/O under load.
 */
export function scheduleSave(): void {
  savePending = true;
  dirtyCount++;
  if (dirtyCount >= FLUSH_THRESHOLD) {
    flushNow();
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushNow, SAVE_DEBOUNCE_MS);
}

export function flushNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (savePending) {
    saveDatabase();
    savePending = false;
    dirtyCount = 0;
  }
}

/** Synchronous, immediate persist — use sparingly. */
export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const fullPath = path.resolve(activeDbPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

export function createProject(data: Omit<Project, "id" | "created_at" | "updated_at" | "last_active">): Project {
  const database = getDb();
  const now = new Date().toISOString();
  const project: Project = {
    id: uuidv4(),
    ...data,
    created_at: now,
    updated_at: now,
    last_active: now
  };

  database.run(
    `INSERT INTO projects (id, name, path, tech_stack, description, created_at, updated_at, last_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [project.id, project.name, project.path, JSON.stringify(project.tech_stack), project.description, project.created_at, project.updated_at, project.last_active]
  );

  scheduleSave();
  return project;
}

export function getProject(idOrName: string): Project | null {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM projects WHERE id = ? OR name = ? LIMIT 1`);
  stmt.bind([idOrName, idOrName]);

  let project: Project | null = null;
  if (stmt.step()) {
    const result = stmt.getAsObject() as any;
    project = mapRowToProject(result);
  }
  stmt.free();
  return project;
}

export function updateProjectLastActive(id: string): void {
  const database = getDb();
  const now = new Date().toISOString();
  database.run(`UPDATE projects SET last_active = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  scheduleSave();
}

/**
 * Partial update of a project (name, path, tech_stack, description). Only the
 * provided fields are changed; memories are untouched. Returns the updated row
 * or null if the project does not exist.
 */
export function updateProject(id: string, patch: { name?: string; path?: string; tech_stack?: string[]; description?: string }): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const database = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const vals: any[] = [now];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.path !== undefined) { sets.push("path = ?"); vals.push(patch.path); }
  if (patch.tech_stack !== undefined) { sets.push("tech_stack = ?"); vals.push(JSON.stringify(patch.tech_stack)); }
  if (patch.description !== undefined) { sets.push("description = ?"); vals.push(patch.description); }
  vals.push(id);
  database.run(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, vals as any[]);
  scheduleSave();
  return getProject(id);
}

export function createMemory(data: Omit<Memory, "id" | "created_at" | "updated_at" | "access_count" | "useful_count" | "not_useful_count" | "last_feedback_at" | "superseded_by"> & { source_sha?: string | null }): Memory {
  const database = getDb();
  const now = new Date().toISOString();
  const memory: Memory = {
    id: uuidv4(),
    ...data,
    access_count: 0,
    useful_count: 0,
    not_useful_count: 0,
    last_feedback_at: null,
    superseded_by: null,
    created_at: now,
    updated_at: now
  };

  const embeddingBlob = memory.embedding ? new Uint8Array(memory.embedding.buffer) : null;
  const sourceSha = (data as any).source_sha ?? null;

  database.run(
    `INSERT INTO memories (id, project_id, type, title, content, embedding, tags, metadata, importance, access_count, useful_count, not_useful_count, last_feedback_at, superseded_by, source_sha, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      memory.id,
      memory.project_id,
      memory.type,
      memory.title,
      memory.content,
      embeddingBlob,
      JSON.stringify(memory.tags),
      JSON.stringify(memory.metadata),
      memory.importance,
      memory.access_count,
      memory.useful_count,
      memory.not_useful_count,
      memory.last_feedback_at,
      memory.superseded_by,
      sourceSha,
      memory.created_at,
      memory.updated_at
    ]
  );

  // keep in-memory indexes hot
  if (memory.embedding) getVectorStore().add(memory.id, memory.embedding);
  getBM25Index().add(memory.id, `${memory.title} ${memory.content}`);

  scheduleSave();
  return memory;
}

/**
 * Robust dedup check using the dedicated source_sha column (no more fragile LIKE).
 * Returns true if a memory with this source_sha already exists.
 */
export function memoryExistsBySha(projectId: string, sha: string): boolean {
  const database = getDb();
  const stmt = database.prepare(`SELECT 1 FROM memories WHERE project_id = ? AND source_sha = ? LIMIT 1`);
  stmt.bind([projectId, sha]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

export function incrementAccessCount(id: string): void {
  const database = getDb();
  database.run(`UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id
  ]);
  scheduleSave();
}

/**
 * Replace a memory's embedding (used when the embedding model changes and all
 * vectors must be recomputed). Also refreshes the in-memory vector store.
 */
export function updateEmbedding(id: string, embedding: Float32Array): void {
  const database = getDb();
  const blob = new Uint8Array(embedding.buffer);
  database.run(`UPDATE memories SET embedding = ?, updated_at = ? WHERE id = ?`, [
    blob,
    new Date().toISOString(),
    id
  ]);
  getVectorStore().add(id, embedding);
  scheduleSave();
}

/**
 * Record explicit human/agent feedback on a memory's usefulness.
 * `useful=true` bumps useful_count, else not_useful_count. This is the core
 * learning signal blended into re-ranking.
 */
export function recordFeedback(id: string, useful: boolean): { useful_count: number; not_useful_count: number } | null {
  const database = getDb();
  const exists = scalar("SELECT COUNT(*) AS c FROM memories WHERE id = ?", [id]) > 0;
  if (!exists) return null;
  const now = new Date().toISOString();
  const col = useful ? "useful_count" : "not_useful_count";
  database.run(
    `UPDATE memories SET ${col} = ${col} + 1, last_feedback_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, id]
  );
  const row = getMemoryById(id);
  scheduleSave();
  return row ? { useful_count: row.useful_count, not_useful_count: row.not_useful_count } : null;
}

/**
 * Versioning: link an older memory as superseded by a newer one. The old memory
 * is kept (history) but excluded from default recall. Returns false if not found.
 */
export function supersedeMemory(oldId: string, newId: string): boolean {
  const exists = scalar("SELECT COUNT(*) AS c FROM memories WHERE id = ?", [oldId]) > 0;
  if (!exists) return false;
  const database = getDb();
  database.run(`UPDATE memories SET superseded_by = ?, updated_at = ? WHERE id = ?`, [
    newId,
    new Date().toISOString(),
    oldId
  ]);
  scheduleSave();
  return true;
}

export function getMemoriesByProject(projectId: string, limit: number = 10): Memory[] {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM memories WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?`);
  stmt.bind([projectId, limit]);
  return collectMemories(stmt);
}

export function getAllMemories(limit: number = 100): Memory[] {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?`);
  stmt.bind([limit]);
  return collectMemories(stmt);
}

/**
 * Fetch memories by a set of ids (used after vector/bm25 search to hydrate full rows).
 */
export function getMemoriesByIds(ids: string[]): Memory[] {
  if (ids.length === 0) return [];
  const database = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const stmt = database.prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`);
  stmt.bind(ids);
  const result = collectMemories(stmt);
  return result;
}

function collectMemories(stmt: any): Memory[] {
  const memories: Memory[] = [];
  while (stmt.step()) {
    memories.push(mapRowToMemory(stmt.getAsObject() as any));
  }
  stmt.free();
  return memories;
}

export interface ProjectWithStats extends Project {
  memory_count: number;
}

export interface Stats {
  projectCount: number;
  memoryCount: number;
  byType: Record<string, number>;
  byProject: Array<{ id: string; name: string; count: number }>;
  unscoped: number;
  lastActivity: string | null;
}

export function getAllProjects(): ProjectWithStats[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM memories m WHERE m.project_id = p.id) AS memory_count
    FROM projects p
    ORDER BY p.last_active DESC
  `);
  const projects: ProjectWithStats[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    const p = mapRowToProject(row);
    projects.push({ ...p, memory_count: row.memory_count });
  }
  stmt.free();
  return projects;
}

function scalar(query: string, params: any[] = []): number {
  const database = getDb();
  const stmt = database.prepare(query);
  stmt.bind(params);
  let value = 0;
  if (stmt.step()) {
    value = Number((stmt.getAsObject() as any).c ?? 0);
  }
  stmt.free();
  return value;
}

export function getStats(): Stats {
  const database = getDb();
  const projectCount = scalar("SELECT COUNT(*) AS c FROM projects");
  const memoryCount = scalar("SELECT COUNT(*) AS c FROM memories");
  const unscoped = scalar("SELECT COUNT(*) AS c FROM memories WHERE project_id IS NULL");

  const byType: Record<string, number> = {};
  const typeStmt = database.prepare("SELECT type, COUNT(*) AS c FROM memories GROUP BY type");
  while (typeStmt.step()) {
    const row = typeStmt.getAsObject() as any;
    byType[row.type] = Number(row.c);
  }
  typeStmt.free();

  const byProject: Array<{ id: string; name: string; count: number }> = [];
  const projStmt = database.prepare(`
    SELECT p.id, p.name, COUNT(m.id) AS c
    FROM projects p
    LEFT JOIN memories m ON m.project_id = p.id
    GROUP BY p.id
    ORDER BY c DESC, p.name ASC
  `);
  while (projStmt.step()) {
    const row = projStmt.getAsObject() as any;
    byProject.push({ id: row.id, name: row.name, count: Number(row.c) });
  }
  projStmt.free();

  let lastActivity: string | null = null;
  const lastStmt = database.prepare("SELECT MAX(created_at) AS c FROM memories");
  if (lastStmt.step()) {
    lastActivity = (lastStmt.getAsObject() as any).c || null;
  }
  lastStmt.free();

  return { projectCount, memoryCount, byType, byProject, unscoped, lastActivity };
}

export interface MemoryFilter {
  projectId?: string | null;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function buildMemoryWhere(filter: MemoryFilter): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) {
      conditions.push("project_id IS NULL");
    } else {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
  }
  if (filter.type) {
    conditions.push("type = ?");
    params.push(filter.type);
  }
  if (filter.search) {
    conditions.push("(title LIKE ? OR content LIKE ? OR tags LIKE ?)");
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  return { where: conditions.length ? "WHERE " + conditions.join(" AND ") : "", params };
}

export function searchMemories(filter: MemoryFilter): Memory[] {
  const database = getDb();
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const { where, params } = buildMemoryWhere(filter);
  const stmt = database.prepare(`SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
  stmt.bind([...params, limit, offset]);
  return collectMemories(stmt);
}

export function countMemories(filter: MemoryFilter): number {
  const { where, params } = buildMemoryWhere(filter);
  return scalar(`SELECT COUNT(*) AS c FROM memories ${where}`, params);
}

export function getMemoryById(id: string): Memory | null {
  const database = getDb();
  const stmt = database.prepare("SELECT * FROM memories WHERE id = ?");
  stmt.bind([id]);
  let memory: Memory | null = null;
  if (stmt.step()) {
    memory = mapRowToMemory(stmt.getAsObject() as any);
  }
  stmt.free();
  return memory;
}

/**
 * Supersede versioning: for a memory, return its successor (the newer memory
 * that replaced it) and its predecessors (older memories this one replaced).
 */
export function getSupersedeChain(id: string): { successor: Memory | null; predecessors: Memory[] } {
  const database = getDb();
  const self = getMemoryById(id);
  const successor = self?.superseded_by ? getMemoryById(self.superseded_by) : null;
  const stmt = database.prepare("SELECT * FROM memories WHERE superseded_by = ? ORDER BY updated_at DESC");
  stmt.bind([id]);
  const predecessors = collectMemories(stmt);
  return { successor, predecessors };
}

export function deleteMemory(id: string): boolean {
  const exists = scalar("SELECT COUNT(*) AS c FROM memories WHERE id = ?", [id]) > 0;
  if (!exists) return false;
  const database = getDb();
  database.run("DELETE FROM memories WHERE id = ?", [id]);
  getVectorStore().remove(id);
  getBM25Index().remove(id);
  scheduleSave();
  return true;
}

export function deleteProject(id: string): boolean {
  const exists = scalar("SELECT COUNT(*) AS c FROM projects WHERE id = ?", [id]) > 0;
  if (!exists) return false;
  const database = getDb();
  // collect memory ids to remove from indexes
  const stmt = database.prepare("SELECT id FROM memories WHERE project_id = ?");
  stmt.bind([id]);
  const ids: string[] = [];
  while (stmt.step()) ids.push((stmt.getAsObject() as any).id);
  stmt.free();
  for (const mid of ids) {
    getVectorStore().remove(mid);
    getBM25Index().remove(mid);
  }
  database.run("DELETE FROM memories WHERE project_id = ?", [id]);
  database.run("DELETE FROM projects WHERE id = ?", [id]);
  scheduleSave();
  return true;
}

// ---------------- Activity logs ----------------

export interface ActivityLog {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  project_id: string | null;
  summary: string;
  source: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function addLog(data: {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  summary: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
}): ActivityLog {
  const database = getDb();
  const log: ActivityLog = {
    id: uuidv4(),
    action: data.action,
    entity_type: data.entityType ?? null,
    entity_id: data.entityId ?? null,
    project_id: data.projectId ?? null,
    summary: data.summary,
    source: data.source ?? null,
    metadata: data.metadata ?? {},
    created_at: new Date().toISOString()
  };
  database.run(
    `INSERT INTO activity_logs (id, action, entity_type, entity_id, project_id, summary, source, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [log.id, log.action, log.entity_type, log.entity_id, log.project_id, log.summary, JSON.stringify(log.metadata), log.created_at]
  );
  scheduleSave();
  return log;
}

export interface LogFilter {
  action?: string;
  source?: string;
  projectId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function buildLogWhere(filter: LogFilter): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter.action) {
    conditions.push("action = ?");
    params.push(filter.action);
  }
  if (filter.source) {
    conditions.push("source = ?");
    params.push(filter.source);
  }
  if (filter.projectId) {
    conditions.push("project_id = ?");
    params.push(filter.projectId);
  }
  if (filter.search) {
    conditions.push("summary LIKE ?");
    params.push(`%${filter.search}%`);
  }
  return { where: conditions.length ? "WHERE " + conditions.join(" AND ") : "", params };
}

export function getLogs(filter: LogFilter): ActivityLog[] {
  const database = getDb();
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const { where, params } = buildLogWhere(filter);
  const stmt = database.prepare(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
  stmt.bind([...params, limit, offset]);
  const logs: ActivityLog[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    logs.push({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type || null,
      entity_id: row.entity_id || null,
      project_id: row.project_id || null,
      summary: row.summary,
      source: row.source || null,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      created_at: row.created_at
    });
  }
  stmt.free();
  return logs;
}

export function countLogs(filter: LogFilter): number {
  const { where, params } = buildLogWhere(filter);
  return scalar(`SELECT COUNT(*) AS c FROM activity_logs ${where}`, params);
}

// ---------------- Mapping helpers ----------------

function blobToFloat32(blob: Uint8Array): Float32Array | null {
  if (!blob || blob.byteLength === 0) return null;
  const arr = new Float32Array(blob.byteLength / 4);
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = view.getFloat32(i * 4, true);
  }
  return arr;
}

function mapRowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    tech_stack: row.tech_stack ? JSON.parse(row.tech_stack) : [],
    description: row.description || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_active: row.last_active
  };
}

function mapRowToMemory(row: any): Memory {
  return {
    id: row.id,
    project_id: row.project_id || null,
    type: row.type,
    title: row.title,
    content: row.content,
    embedding: row.embedding ? blobToFloat32(row.embedding) : null,
    tags: row.tags ? JSON.parse(row.tags) : [],
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    importance: row.importance,
    access_count: row.access_count,
    useful_count: row.useful_count ?? 0,
    not_useful_count: row.not_useful_count ?? 0,
    last_feedback_at: row.last_feedback_at ?? null,
    superseded_by: row.superseded_by ?? null,
    source_sha: row.source_sha ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
