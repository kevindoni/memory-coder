import express, { Request } from "express";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  createProjectService,
  feedbackService,
  getProjectContextService,
  logBugService,
  recallService,
  rememberService
} from "../core/memory-service.js";
import {
  addMemoryService,
  conflictsService,
  evalTrendService,
  deleteMemoryService,
  deleteProjectService,
  exportSkillService,
  embedStatusService,
  getMemoryService,
  indexProjectService,
  listLogsService,
  listMemoriesService,
  listProjectsService,
  reembedService,
  smartStatusService,
  smartExpireService,
  smartScopeService,
  statsService,
  supersedeChainService,
  updateMemoryService,
  updateProjectService
} from "../core/admin-service.js";
import { relatedMemoriesService, suggestPatternsService } from "../core/graph-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.join(__dirname, "..", "..", "dashboard", "dist");

const ADMIN_API_KEY = process.env.MEMORY_CODER_API_KEY || "";

/**
 * API key auth for admin endpoints.
 * If MEMORY_CODER_API_KEY is not set, auth is skipped (localhost-only dev mode).
 */
function requireApiKey(req: Request, res: express.Response, next: express.NextFunction): void {
  if (!ADMIN_API_KEY) return next(); // disabled in dev
  const provided = req.headers["x-api-key"] || (req.query.api_key as string) || "";
  if (provided === ADMIN_API_KEY) return next();
  res.status(401).json({ success: false, error: "Unauthorized: invalid or missing API key (X-API-Key header)" });
}

// General rate limit for write endpoints
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.MEMORY_CODER_WRITE_RATE || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many write requests, slow down." }
});

export async function startBridge(port = 3333) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // Request logging (Apache-style) to stderr
  app.use(morgan(":method :url :status :res[content-length] - :response-time ms", { stream: { write: (s) => process.stderr.write(s) } }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "memory-coder-bridge" });
  });

  // Core memory endpoints (agent-facing)
  const coreRouter = express.Router();
  coreRouter.post("/create-project", (req, res) => respond(res, createProjectService(req.body)));
  coreRouter.post("/get-project-context", (req, res) => respond(res, getProjectContextService(req.body)));
  coreRouter.post("/remember", writeLimiter, (req, res) => respond(res, rememberService(req.body)));
  coreRouter.post("/recall", (req, res) => respond(res, recallService(req.body)));
  coreRouter.post("/feedback", writeLimiter, (req, res) => respond(res, feedbackService(req.body)));
  coreRouter.post("/memory/:id/feedback", writeLimiter, (req, res) => respond(res, feedbackService({ ...req.body, memory_id: req.params.id })));
  coreRouter.get("/memory/:id/related", (req, res) => respond(res, Promise.resolve(relatedMemoriesService({ memory_id: req.params.id, ...req.query }))));
  coreRouter.get("/suggest-patterns", (req, res) => respond(res, Promise.resolve(suggestPatternsService(req.query as Record<string, unknown>))));
  coreRouter.post("/log-bug", writeLimiter, (req, res) => respond(res, logBugService(req.body)));
  app.use("/", coreRouter);
  app.use("/v1", coreRouter);

  // Admin / monitoring endpoints (auth-protected)
  const adminRouter = express.Router();
  adminRouter.use(requireApiKey);

  adminRouter.get("/stats", (_req, res) => respond(res, statsService()));
  adminRouter.get("/smart-status", (_req, res) => respond(res, Promise.resolve(smartStatusService())));
  adminRouter.post("/smart-expire", writeLimiter, (req: Request, res) => respond(res, Promise.resolve(smartExpireService(req.body))));
  adminRouter.post("/smart-scope", writeLimiter, (req: Request, res) => respond(res, Promise.resolve(smartScopeService(req.body))));
  adminRouter.get("/projects", (_req, res) => respond(res, listProjectsService()));
  adminRouter.get("/memories", (req: Request, res) => respond(res, listMemoriesService(req.query as Record<string, unknown>)));
  adminRouter.post("/memories", writeLimiter, (req: Request, res) => respond(res, addMemoryService(req.body)));
  adminRouter.get("/memories/:id", (req: Request, res) => respond(res, getMemoryService(String(req.params.id))));
  adminRouter.get("/memories/:id/related", (req: Request, res) => respond(res, Promise.resolve(relatedMemoriesService({ memory_id: req.params.id, ...req.query }))));
  adminRouter.get("/suggest-patterns", (req: Request, res) => respond(res, Promise.resolve(suggestPatternsService(req.query as Record<string, unknown>))));
  adminRouter.delete("/memories/:id", (req: Request, res) => respond(res, deleteMemoryService(String(req.params.id))));
  adminRouter.put("/memories/:id", writeLimiter, (req: Request, res) => respond(res, Promise.resolve(updateMemoryService(String(req.params.id), req.body as { project_id?: string | null; superseded_by?: string | null }))));
  adminRouter.delete("/projects/:id", (req: Request, res) => respond(res, deleteProjectService(String(req.params.id))));
  adminRouter.put("/projects/:id", writeLimiter, (req: Request, res) => respond(res, Promise.resolve(updateProjectService(String(req.params.id), req.body))));
  adminRouter.post("/projects/:id/index", (req: Request, res) => respond(res, indexProjectService(String(req.params.id))));
  adminRouter.post("/reembed", writeLimiter, (req: Request, res) => respond(res, reembedService(req.body)));
  adminRouter.get("/embed-status", (_req, res) => respond(res, Promise.resolve(embedStatusService())));
  adminRouter.get("/conflicts", (req: Request, res) => respond(res, Promise.resolve(conflictsService(req.query as Record<string, unknown>))));
  adminRouter.get("/eval-trend", (_req: Request, res) => respond(res, Promise.resolve(evalTrendService())));
  adminRouter.get("/projects/:id/export-skill", (req: Request, res) => respond(res, Promise.resolve(exportSkillService(String(req.params.id), (req.query.format as "skill" | "agents") || "skill"))));
  adminRouter.get("/memories/:id/chain", (req: Request, res) => respond(res, Promise.resolve(supersedeChainService(String(req.params.id)))));
  adminRouter.get("/logs", (req: Request, res) => respond(res, listLogsService(req.query as Record<string, unknown>)));

  app.use("/v1/admin", adminRouter);

  // Serve dashboard SPA (static assets first, then index.html fallback)
  if (fs.existsSync(dashboardDir)) {
    app.use(express.static(dashboardDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/v1") && !req.path.startsWith("/health") && !req.path.includes(".")) {
        return res.sendFile(path.join(dashboardDir, "index.html"));
      }
      next();
    });
  }

  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.error(`🌉 Memory Coder Bridge running on http://localhost:${port}`);
      if (!ADMIN_API_KEY) {
        console.error(`⚠️  WARNING: MEMORY_CODER_API_KEY not set — admin endpoints are UNAUTHENTICATED (dev mode only)`);
      }
      resolve();
    });
  });
}

async function respond(res: express.Response, promise: Promise<unknown>) {
  try {
    const result = await promise;
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
