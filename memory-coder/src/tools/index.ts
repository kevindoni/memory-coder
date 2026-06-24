import {
  createProjectService,
  feedbackService,
  getProjectContextService,
  logBugService,
  recallService,
  rememberService
} from "../core/memory-service.js";

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
        project_name: { type: "string", description: "Project name" }
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

export const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  create_project: createProjectService,
  get_project_context: getProjectContextService,
  remember: rememberService,
  recall: recallService,
  log_bug: logBugService,
  feedback: feedbackService
};
