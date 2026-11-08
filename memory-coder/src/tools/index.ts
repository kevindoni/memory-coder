import {
  createProjectService,
  feedbackService,
  getProjectContextService,
  logBugService,
  recallService,
  rememberService
} from "../core/memory-service.js";

/**
 * Single-writer rule: when the HTTP bridge is running it owns memory.db.
 * MCP stdio instances route tool calls to the bridge REST API instead of
 * opening the database directly (two sql.js processes snapshot-flushing the
 * same file silently clobber each other's writes).
 */
const BRIDGE_URL = (process.env.MEMORY_CODER_BRIDGE_URL || "http://127.0.0.1:3333").replace(/\/+$/, "");
const PROBE_TTL_MS = 30_000;

const REST_ROUTES: Record<string, string> = {
  create_project: "/v1/create-project",
  get_project_context: "/v1/get-project-context",
  remember: "/v1/remember",
  recall: "/v1/recall",
  log_bug: "/v1/log-bug",
  feedback: "/v1/feedback"
};

let bridgeProbe: { alive: boolean; checkedAt: number } | null = null;

export async function bridgeAlive(): Promise<boolean> {
  const now = Date.now();
  if (bridgeProbe && now - bridgeProbe.checkedAt < PROBE_TTL_MS) return bridgeProbe.alive;
  let alive = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    alive = Boolean(body && body.ok);
  } catch {
    alive = false;
  }
  bridgeProbe = { alive, checkedAt: now };
  return alive;
}

async function callBridge(route: string, args: unknown): Promise<unknown> {
  const res = await fetch(`${BRIDGE_URL}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {})
  });
  return res.json().catch(() => ({ success: false, error: `bridge HTTP ${res.status}` }));
}

export const tools = [
  {
    name: "create_project",
    description: "Register a new coding project. Call this first to set up the workspace context.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        path: { type: "string", description: "Project root path" },
        tech_stack: { type: "array", items: { type: "string" }, description: "Tech stack used" },
        description: { type: "string", description: "Brief project description" }
      },
      required: ["name", "path"]
    }
  },
  {
    name: "get_project_context",
    description: "Get project context including preferences and recent memories.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project ID or name" },
        name: { type: "string", description: "Project name (alternative)" }
      }
    }
  },
  {
    name: "remember",
    description: "Store any important coding information (bugs, decisions, patterns, learnings).",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory content to store" },
        type: { type: "string", enum: ["bug", "decision", "pattern", "learning", "general"], description: "Type of memory" },
        project_id: { type: "string", description: "Project ID" },
        project_name: { type: "string", description: "Project name" },
        cwd: { type: "string", description: "Working directory of the current project — enables auto-detection/auto-registration of the project" },
        title: { type: "string", description: "Short title" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        metadata: { type: "object", description: "Additional metadata" }
      },
      required: ["content", "type"]
    }
  },
  {
    name: "recall",
    description: "Search memories semantically - finds relevant past experiences even with different wording. This is the core memory search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query in natural language" },
        project_id: { type: "string", description: "Filter by project ID" },
        project_name: { type: "string", description: "Filter by project name" },
        type: { type: "string", enum: ["bug", "decision", "pattern", "learning", "general"], description: "Filter by memory type" },
        limit: { type: "number", description: "Max results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "log_bug",
    description: "Shortcut to log a bug and its solution. Essential for preventing the same mistake twice.",
    inputSchema: {
      type: "object",
      properties: {
        error: { type: "string", description: "Error message" },
        context: { type: "string", description: "Where it happened" },
        solution: { type: "string", description: "How it was fixed" },
        project_id: { type: "string", description: "Project ID" },
        project_name: { type: "string", description: "Project name" },
        cwd: { type: "string", description: "Working directory of the current project — enables auto-detection of the project" }
      },
      required: ["error", "context", "solution"]
    }
  },
  {
    name: "feedback",
    description: "Rate a recalled memory as useful or not-useful. This is the learning loop — useful memories rank higher next time, unhelpful ones sink.",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "The memory id returned by recall" },
        useful: { type: "boolean", description: "true = helpful, false = not helpful" },
        note: { type: "string", description: "Optional short note" }
      },
      required: ["memory_id", "useful"]
    }
  }
];

const directHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  create_project: createProjectService,
  get_project_context: getProjectContextService,
  remember: rememberService,
  recall: recallService,
  log_bug: logBugService,
  feedback: feedbackService
};

export const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {};
for (const name of Object.keys(directHandlers)) {
  toolHandlers[name] = async (args: unknown) => {
    if (await bridgeAlive()) {
      try {
        return await callBridge(REST_ROUTES[name], args);
      } catch (e) {
        // bridge owns the DB in this mode — no silent fallback to a cold
        // local database; surface the failure instead
        return { success: false, error: `bridge call failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return directHandlers[name](args);
  };
}
