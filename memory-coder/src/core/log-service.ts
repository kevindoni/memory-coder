import { addLog } from "../db/index.js";

export interface LogEntry {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  summary: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records an activity log entry. Never throws — logging must never break the
 * operation it is tracking. The single bridge process owns the in-memory DB,
 * so writes here are safe and visible to all clients.
 */
export function recordLog(entry: LogEntry): void {
  try {
    addLog(entry);
  } catch (err) {
    console.error("[log] failed to record activity:", err instanceof Error ? err.message : String(err));
  }
}
