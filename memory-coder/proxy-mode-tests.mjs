// Regression tests: single-writer proxy mode (bridge alive => MCP instance
// must never open memory.db, and must never silently fall back to it).
// Run: node proxy-mode-tests.mjs   (after `npm run build`)
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { toolHandlers, enableProxyMode } from "./dist/tools/index.js";

const MARKER = { success: true, from: "fake-bridge" };

function startFakeBridge() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/v1/remember") {
      res.end(JSON.stringify({ success: true, from: "fake-bridge-remember" }));
      return;
    }
    if (req.url === "/v1/recall") {
      res.end(JSON.stringify(MARKER));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.connect(port, "127.0.0.1");
    probe.on("connect", () => { probe.destroy(); resolve(false); });
    probe.on("error", () => resolve(true));
  });
}

async function waitFor(predicate, ms = 5000) {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 100));
  }
}

console.log("=== PROXY MODE REGRESSION TESTS ===");

// Helper: grab a port, free it, and hand back a URL nothing is listening on.
async function deadBridgeUrl() {
  const srv = net.createServer();
  const port = await new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv.address().port)));
  await closeServer(srv);
  return `http://127.0.0.1:${port}`;
}

// --- Scenario A: standalone (no enableProxyMode), bridge up -> probe routing via HTTP
{
  const bridge = await startFakeBridge();
  const port = bridge.address().port;
  process.env.MEMORY_CODER_BRIDGE_URL = `http://127.0.0.1:${port}`;
  const mod = await import(`./dist/tools/index.js?a=${Date.now()}`);
  assert.strictEqual(await mod.bridgeAlive(), true, "probe should see the fake bridge");
  const res = await mod.toolHandlers.recall({ query: "anything" });
  assert.deepStrictEqual(res, MARKER, "standalone mode routes via HTTP while bridge is up");
  await closeServer(bridge);
  console.log("1. standalone + bridge up -> HTTP routing ok");
}

// --- Scenario B: proxy pinned -> routes via HTTP with NO database opened
{
  const bridge = await startFakeBridge();
  const port = bridge.address().port;
  process.env.MEMORY_CODER_BRIDGE_URL = `http://127.0.0.1:${port}`;
  const mod = await import(`./dist/tools/index.js?proxy=${Date.now()}`);
  mod.enableProxyMode();
  const res = await mod.toolHandlers.recall({ query: "anything" });
  assert.deepStrictEqual(res, MARKER, "proxy mode must route via HTTP");
  await closeServer(bridge);
  console.log("2. proxy mode routes via HTTP (db never opened) ok");
}

// --- Scenario C: proxy pinned + bridge DOWN -> clean error, no stale-DB fallback
{
  process.env.MEMORY_CODER_BRIDGE_URL = await deadBridgeUrl();
  const mod = await import(`./dist/tools/index.js?proxydown=${Date.now()}`);
  mod.enableProxyMode();
  const res = await mod.toolHandlers.recall({ query: "anything" });
  assert.strictEqual(res.success, false, "bridge outage must surface an error in proxy mode");
  assert.ok(String(res.error).startsWith("bridge call failed:"), `unexpected error: ${res.error}`);
  console.log("3. bridge outage surfaces clean error (no silent stale-db fallback) ok");
}

// --- Scenario D: standalone + bridge down + no db init -> direct path error
{
  const dead = await deadBridgeUrl();
  const code = `
    process.env.MEMORY_CODER_BRIDGE_URL = ${JSON.stringify(dead)};
    const { toolHandlers } = await import("./dist/tools/index.js");
    try {
      await toolHandlers.feedback({ memory_id: "x", useful: true });
      console.log("WRONG: no error");
    } catch (e) {
      console.log("ERR:" + (e.message || "").split(".")[0]);
    }
  `;
  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.on("close", () => resolve(buf.trim()));
    p.on("error", reject);
  });
  assert.ok(out.includes("Database not initialized"), `standalone mode should hit direct handlers (got: ${out})`);
  console.log("4. standalone + bridge down -> direct handlers (local db) ok");
}

// --- Scenario E: e2e — dist/index.js with bridge alive must never create the db file
{
  const bridge = await startFakeBridge();
  const port = bridge.address().port;
  const tmpDb = path.join(os.tmpdir(), `mc-proxy-test-${Date.now()}`, "memory.db");
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MEMORY_CODER_BRIDGE_URL: `http://127.0.0.1:${port}`,
      MEMORY_DB_PATH: tmpDb,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d));
  // MCP handshake over stdio
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "recall", arguments: { query: "x" } } }) + "\n");
  await waitFor(() => stdout.includes("fake-bridge"), 10000);
  await new Promise((r) => setTimeout(r, 300)); // give any buggy init a window to write the file
  assert.ok(!fs.existsSync(tmpDb), "proxy-mode MCP instance must not create/open the database file");
  child.kill("SIGKILL");
  await closeServer(bridge);
  console.log("5. e2e: bridge alive -> db file never created, tool call proxied ok");
}

// --- Scenario F: e2e — CLI with bridge alive must proxy over HTTP, never open the db
{
  const bridge = await startFakeBridge();
  const port = bridge.address().port;
  const tmpDb = path.join(os.tmpdir(), `mc-cli-proxy-test-${Date.now()}`, "memory.db");
  const args = ["dist/cli.js", "remember", "--json", JSON.stringify({ content: "cli proxy regression", type: "general" })];
  const { code, stdout } = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, MEMORY_CODER_BRIDGE_URL: `http://127.0.0.1:${port}`, MEMORY_DB_PATH: tmpDb },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (c) => resolve({ code: c, stdout: out }));
    child.on("error", reject);
  });
  assert.strictEqual(code, 0, `cli should exit 0 (got ${code})`);
  assert.ok(stdout.includes("fake-bridge-remember"), `cli output must come from the bridge (got: ${stdout})`);
  await new Promise((r) => setTimeout(r, 300)); // give a buggy direct write a window to flush
  assert.ok(!fs.existsSync(tmpDb), "cli with bridge alive must not create/open the database file");
  await closeServer(bridge);
  console.log("6. e2e cli: bridge alive -> proxied via HTTP, db file never created ok");
}

// --- Scenario G: e2e — CLI with NO bridge still works directly and persists locally
{
  const dead = await deadBridgeUrl();
  const tmpDb = path.join(os.tmpdir(), `mc-cli-direct-test-${Date.now()}`, "memory.db");
  const args = ["dist/cli.js", "create-project", "--json", JSON.stringify({ name: "cli-direct", path: "D:/tmp/cli-direct" })];
  const { code, stdout } = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, MEMORY_CODER_BRIDGE_URL: dead, MEMORY_DB_PATH: tmpDb },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (c) => resolve({ code: c, stdout: out }));
    child.on("error", reject);
  });
  assert.strictEqual(code, 0, `standalone cli should exit 0 (got ${code}): ${stdout}`);
  assert.ok(stdout.includes("Project created successfully"), `standalone cli should create the project (got: ${stdout})`);
  assert.ok(fs.existsSync(tmpDb), "standalone cli must persist the database file");
  console.log("7. e2e cli: no bridge -> direct path persists locally ok");
}

console.log("\n=== ALL PROXY MODE TESTS PASSED ===");
