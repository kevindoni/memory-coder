import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { createMemory, getAllProjects, getProject, memoryExistsBySha } from "../db/index.js";
import { getEmbedder } from "../embeddings/index.js";
import { summarizeCommits } from "./auto-summarizer.js";
import { llmConfigured } from "./llm-service.js";
import { recordLog } from "./log-service.js";

const MAX_COMMITS = 100;

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function commitAlreadyIndexed(projectId: string, sha: string): boolean {
  return memoryExistsBySha(projectId, sha);
}

function readCommits(repoPath: string, max = MAX_COMMITS): Array<{ sha: string; author: string; date: string; message: string }> {
  try {
    const raw = execSync(`git -C "${repoPath}" log --pretty=format:"%H|%an|%ad|%s" --date=short -n ${max}`, {
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true
    });
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|");
        const sha = parts.shift() || "";
        const author = parts.shift() || "";
        const date = parts.shift() || "";
        const message = parts.join("|").trim();
        return { sha, author, date, message };
      });
  } catch {
    return [];
  }
}

export async function indexProjectGit(projectId: string) {
  const project = getProject(projectId);
  if (!project) return { success: false, error: "Project not found" };
  if (!isGitRepo(project.path)) return { success: false, skipped: true, error: "Not a git repository" };

  const commits = readCommits(project.path);
  if (commits.length === 0) return { success: false, skipped: true, error: "No commits or git unavailable" };

  const embedder = getEmbedder();
  let added = 0;
  let skipped = 0;
  const addedCommits: Array<{ sha: string; author: string; date: string; message: string }> = [];

  for (const commit of [...commits].reverse()) {
    if (commitAlreadyIndexed(project.id, commit.sha)) {
      skipped++;
      continue;
    }
    const shortSha = commit.sha.slice(0, 7);
    const content = `Commit ${shortSha} oleh ${commit.author} pada ${commit.date}: ${commit.message}`;
    const embedding = await embedder.embed(`${commit.message} ${content}`);
    createMemory({
      project_id: project.id,
      type: "general",
      title: `${shortSha} ${commit.message}`.substring(0, 120),
      content,
      embedding,
      tags: ["git", "commit"],
      metadata: { sha: commit.sha, author: commit.author, date: commit.date, indexer: true },
      importance: 0.3,
      source_sha: commit.sha
    } as any);
    addedCommits.push(commit);
    added++;
  }

  // LLM-powered smart extraction of newly indexed commits
  let smartAdded = 0;
  if (addedCommits.length > 0 && llmConfigured()) {
    try {
      const result = await summarizeCommits(project.id, project.name, addedCommits);
      smartAdded = result.added;
    } catch (e) {
      console.error("[indexer] smart summary error:", e instanceof Error ? e.message : String(e));
    }
  }

  recordLog({
    action: "git_indexed",
    entityType: "git",
    entityId: project.id,
    projectId: project.id,
    summary: `Index git: ${project.name} +${added} commit${smartAdded ? `, smart +${smartAdded}` : ""}${skipped ? `, ${skipped} duplikat` : ""}`,
    source: "indexer",
    metadata: { added, skipped, smartAdded, total: commits.length }
  });

  return { success: true, project: project.name, added, skipped, smartAdded, total: commits.length };
}

/**
 * Standalone smart summary: reads the last N commits (regardless of dedup) and
 * uses the LLM to extract typed memories. Useful for initial population of
 * projects that were raw-indexed before the LLM was configured.
 */
export async function smartSummaryProject(projectId: string, maxCommits = 50) {
  const project = getProject(projectId);
  if (!project) return { success: false, error: "Project not found" };
  if (!isGitRepo(project.path)) return { success: false, skipped: true, error: "Not a git repository" };
  if (!llmConfigured()) return { success: false, error: "OpenRouter belum dikonfigurasi" };

  const commits = readCommits(project.path, maxCommits);
  if (commits.length === 0) return { success: false, skipped: true, error: "No commits or git unavailable" };

  const result = await summarizeCommits(project.id, project.name, commits);
  return { success: true, project: project.name, smartAdded: result.added, commits: commits.length, skipped: result.skipped, error: result.error };
}

export async function indexAllProjects() {  const projects = getAllProjects();
  const results: Array<Record<string, unknown>> = [];
  let totalAdded = 0;
  for (const p of projects) {
    try {
      const r = await indexProjectGit(p.id);
      results.push({ project: p.name, ...r });
      if (r.success) totalAdded += (r as any).added || 0;
    } catch (e) {
      results.push({ project: p.name, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  recordLog({
    action: "index_run",
    entityType: "git",
    summary: `Auto-index: +${totalAdded} commit baru dari ${projects.length} project`,
    source: "indexer",
    metadata: { projects: projects.length, added: totalAdded }
  });
  return results;
}

let indexerTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoIndexer(): void {
  const minutes = Number(process.env.INDEXER_INTERVAL_MIN || 0);
  if (!minutes || minutes <= 0 || indexerTimer) return;
  console.error(`[indexer] auto-index setiap ${minutes} menit`);
  indexerTimer = setInterval(() => {
    indexAllProjects().catch((e) => console.error("[indexer] error:", e instanceof Error ? e.message : String(e)));
  }, minutes * 60 * 1000);
}
