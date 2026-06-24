#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = process.env.MC_BASE || "http://127.0.0.1:3333";
const OUT_DIR = __dirname;
const args = process.argv.slice(2);
const FLAG = (k) => args.includes(k);
const VAL = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const SEED = FLAG("--seed");
const SEED_N = parseInt(VAL("--seed-n", "25"), 10);
const K = parseInt(VAL("--k", "5"), 10);
const GOLDEN_FILE = path.join(OUT_DIR, VAL("--file", "golden-qa.json"));
const TREND_FILE = path.join(OUT_DIR, "eval-trend.jsonl");
const PROJECT = VAL("--project", "");

function timeoutFetch(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
const getJSON = (u) => timeoutFetch(u).then((r) => r.json());
const postJSON = (u, b) => timeoutFetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

const STOP = new Set("the and for pro app api web with from that this using use into your a an of to in is are was be on at by it as or yang dan untuk dari ke di atau".split(" "));
function distinctive(title) {
  const toks = String(title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  return toks[0] || "";
}

async function fetchAll() {
  const all = []; let offset = 0; const pageSize = 500; let total = 0;
  do {
    const res = await getJSON(`${BASE}/v1/admin/memories?limit=${pageSize}&offset=${offset}`);
    if (!res || !res.success) throw new Error("fetch failed");
    total = res.total; all.push(...(res.memories || [])); offset += pageSize;
  } while (offset < total);
  return all;
}

function buildGoldenFromMemories(mems, n, projMap) {
  const usable = mems
    .filter((m) => !m.superseded_by && distinctive(m.title))
    .sort((a, b) => ((b.useful_count || 0) + (b.access_count || 0) * 0.1) - ((a.useful_count || 0) + (a.access_count || 0) * 0.1))
    .slice(0, n);
  return usable.map((m) => ({
    query: m.title,
    expect_id: m.id,
    expect_title_contains: distinctive(m.title),
    project_name: (m.project_id && projMap.get(m.project_id)) || null,
    type: m.type
  }));
}

function hit(results, g) {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (g.expect_id && r.id === g.expect_id) return i + 1;
    if (g.expect_title_contains && String(r.title || "").toLowerCase().includes(g.expect_title_contains)) return i + 1;
  }
  return 0;
}

async function main() {
  const health = await getJSON(`${BASE}/health`).catch(() => null);
  if (!health) { console.error("memory-bridge-down"); process.exit(1); }

  let golden;
  if (SEED) {
    const all = await fetchAll();
    const projRes = await getJSON(`${BASE}/v1/admin/projects`);
    const projMap = new Map((projRes.projects || []).map((p) => [p.id, p.name]));
    golden = buildGoldenFromMemories(PROJECT ? all.filter((m) => projMap.get(m.project_id) === PROJECT) : all, SEED_N, projMap);
    fs.writeFileSync(GOLDEN_FILE, JSON.stringify(golden, null, 2));
    console.log(`Seeded ${golden.length} golden items -> ${path.basename(GOLDEN_FILE)}`);
  } else if (fs.existsSync(GOLDEN_FILE)) {
    golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf8"));
    console.log(`Loaded ${golden.length} golden items from ${path.basename(GOLDEN_FILE)}`);
  } else {
    console.error("Belum ada golden set. Jalankan --seed dulu.");
    process.exit(1);
  }
  if (PROJECT) golden = golden.filter((g) => !g.project_name || g.project_name === PROJECT);
  if (!golden.length) { console.error("Golden kosong setelah filter."); process.exit(1); }

  let hits = 0, rankSum = 0, rrSum = 0;
  const details = [];
  for (const g of golden) {
    const body = { query: g.query, limit: K };
    if (g.project_name) body.project_name = g.project_name;
    const res = await postJSON(`${BASE}/v1/recall`, body);
    const results = (res && res.results) || [];
    const rank = hit(results, g);
    const ok = rank > 0;
    if (ok) { hits++; rankSum += rank; rrSum += 1 / rank; }
    details.push({ query: g.query, hit: ok, rank, top: results[0]?.title?.slice(0, 50) ?? null });
  }

  const n = golden.length;
  const hitRate = hits / n;
  const mrr = rrSum / n;
  const avgRank = hits ? rankSum / hits : 0;

  console.log(`\n=== EVAL RECALL@${K} ===`);
  console.log(`Golden items : ${n}`);
  console.log(`Hit rate@${K} : ${(hitRate * 100).toFixed(1)}%  (${hits}/${n})`);
  console.log(`MRR          : ${mrr.toFixed(3)}`);
  console.log(`Avg rank hit : ${avgRank.toFixed(2)}`);
  console.log("\nMisses:");
  for (const d of details.filter((x) => !x.hit).slice(0, 10)) console.log(`  MISS "${d.query.slice(0, 55)}" | top: ${d.top}`);

  const record = { ts: new Date().toISOString(), n, k: K, hitRate: +hitRate.toFixed(4), mrr: +mrr.toFixed(4), avgRank: +avgRank.toFixed(2) };
  fs.appendFileSync(TREND_FILE, JSON.stringify(record) + "\n");
  console.log(`\nTrend tersimpan -> ${path.basename(TREND_FILE)}`);
  if (fs.existsSync(TREND_FILE)) {
    const lines = fs.readFileSync(TREND_FILE, "utf8").trim().split("\n");
    if (lines.length >= 2) {
      const prev = JSON.parse(lines[lines.length - 2]);
      const delta = (hitRate - prev.hitRate) * 100;
      console.log(`vs sebelumnya: hitRate ${prev.hitRate * 100}% -> ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`);
    }
  }
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
