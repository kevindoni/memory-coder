import fs from "fs";
import path from "path";
import { captureConversationService } from "./conversation-service.js";
import { getAllProjects } from "../db/index.js";
import { recordLog } from "./log-service.js";
import { llmConfigured } from "./llm-service.js";

const DEFAULT_WATCH_DIR = path.resolve(process.cwd(), "captures");
const VALID_EXT = [".txt", ".md"];
const MAX_FILE_SIZE = 100_000;

let watcherStarted = false;

function ensureDirs(watchDir: string) {
  const processed = path.join(watchDir, "processed");
  const errorDir = path.join(watchDir, "error");
  for (const d of [watchDir, processed, errorDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  return { processed, errorDir };
}

function detectProject(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  const projects = getAllProjects();
  const lower = base.toLowerCase();
  const match = projects.find(
    (p) => lower.startsWith(p.name.toLowerCase()) || lower.includes(p.name.toLowerCase()),
  );
  return match?.name ?? null;
}

async function processFile(filePath: string, watchDir: string, dirs: { processed: string; errorDir: string }) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();

  if (!VALID_EXT.includes(ext)) return;

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      console.error(`[file-watcher] skip ${fileName} (>100KB)`);
      const dest = path.join(dirs.errorDir, fileName);
      fs.renameSync(filePath, dest);
      return;
    }

    const conversation = fs.readFileSync(filePath, "utf8").trim();
    if (conversation.length < 20) {
      console.error(`[file-watcher] skip ${fileName} (too short)`);
      const dest = path.join(dirs.errorDir, fileName);
      fs.renameSync(filePath, dest);
      return;
    }

    const projectName = detectProject(fileName);

    console.error(`[file-watcher] processing ${fileName}${projectName ? ` [${projectName}]` : ""} (${conversation.length} chars)...`);

    const result = await captureConversationService({
      conversation,
      project_name: projectName,
    }) as any;

    if (result.success) {
      const dest = path.join(dirs.processed, fileName);
      fs.renameSync(filePath, fs.existsSync(dest)
        ? path.join(dirs.processed, `${Date.now()}-${fileName}`)
        : dest);

      recordLog({
        action: "conversation_captured",
        entityType: "memory",
        projectId: null,
        summary: `Auto file capture: ${fileName} → +${result.extracted ?? 0} memori${projectName ? ` (${projectName})` : ""}`,
        source: "file-watcher",
        metadata: { extracted: result.extracted ?? 0, file: fileName, project: projectName },
      });

      console.error(`[file-watcher] ✓ ${fileName} → ${result.extracted ?? 0} memories`);
    } else {
      const dest = path.join(dirs.errorDir, fileName);
      fs.renameSync(filePath, dest);
      console.error(`[file-watcher] ✗ ${fileName}: ${result.error}`);
    }
  } catch (e) {
    const dest = path.join(dirs.errorDir, fileName);
    try { fs.renameSync(filePath, dest); } catch {}
    console.error(`[file-watcher] error ${fileName}:`, e instanceof Error ? e.message : String(e));
  }
}

export function startFileWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;

  const watchDir = process.env.CAPTURES_DIR || DEFAULT_WATCH_DIR;
  if (!llmConfigured()) {
    console.error(`[file-watcher] LLM not configured — watcher disabled`);
    return;
  }

  const dirs = ensureDirs(watchDir);
  console.error(`[file-watcher] watching ${watchDir} for .txt/.md files`);

  for (const file of fs.readdirSync(watchDir)) {
    const full = path.join(watchDir, file);
    if (fs.statSync(full).isFile()) {
      processFile(full, watchDir, dirs).catch((e) =>
        console.error(`[file-watcher] startup error:`, e instanceof Error ? e.message : String(e)),
      );
    }
  }

  let debounce: ReturnType<typeof setTimeout> | null = null;
  fs.watch(watchDir, (eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    if (!VALID_EXT.includes(ext)) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const full = path.join(watchDir, filename);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        processFile(full, watchDir, dirs).catch((e) =>
          console.error(`[file-watcher] error:`, e instanceof Error ? e.message : String(e)),
        );
      }
    }, 1000);
  });
}

export function getFileWatcherStatus() {
  const watchDir = process.env.CAPTURES_DIR || DEFAULT_WATCH_DIR;
  const processed = path.join(watchDir, "processed");
  const errorDir = path.join(watchDir, "error");

  const pending = fs.existsSync(watchDir)
    ? fs.readdirSync(watchDir).filter((f) => VALID_EXT.includes(path.extname(f).toLowerCase()))
    : [];

  const processedCount = fs.existsSync(processed) ? fs.readdirSync(processed).length : 0;
  const errorCount = fs.existsSync(errorDir) ? fs.readdirSync(errorDir).length : 0;

  return {
    active: watcherStarted,
    watchDir,
    llmConfigured: llmConfigured(),
    pending: pending.length,
    processed: processedCount,
    errors: errorCount,
  };
}
