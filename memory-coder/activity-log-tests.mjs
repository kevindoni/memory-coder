// Regression tests: activity_logs persistence. addLog bound 8 params against
// 9 placeholders (source was missing), shifting every later value one column
// left so created_at bound NULL and every insert failed with
// "NOT NULL constraint failed: activity_logs.created_at" — recordLog swallowed
// the error, so no activity log entry was ever persisted.
// Run: node activity-log-tests.mjs   (after `npm run build`)
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { initDatabase, addLog, getLogs, countLogs } from "./dist/db/index.js";

const tmp = path.join(os.tmpdir(), `mc-log-test-${Date.now()}`);
await initDatabase(path.join(tmp, "memory.db"));

const log = addLog({
  action: "log_regression",
  entityType: "memory",
  entityId: "m1",
  projectId: "p1",
  summary: "activity log must persist",
  source: "agent",
  metadata: { kind: "regression" }
});

assert.strictEqual(countLogs({}), 1, "activity log row must be persisted");
const rows = getLogs({ action: "log_regression" });
assert.strictEqual(rows.length, 1, "inserted log must be readable back");
const row = rows[0];
assert.strictEqual(row.id, log.id, "row id must match");
assert.strictEqual(row.source, "agent", "source column must hold source (not shifted metadata)");
assert.strictEqual(row.entity_id, "m1", "entity_id column must hold entity_id");
assert.strictEqual(row.project_id, "p1", "project_id column must hold project_id");
assert.strictEqual(row.summary, "activity log must persist", "summary must round-trip");
assert.deepStrictEqual(row.metadata, { kind: "regression" }, "metadata must round-trip as JSON");
assert.strictEqual(typeof row.created_at, "string", "created_at must be set");
assert.ok(!Number.isNaN(Date.parse(row.created_at)), "created_at must be an ISO timestamp");

console.log("=== ACTIVITY LOG TESTS PASSED ===");
