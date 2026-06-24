#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = process.env.MC_BASE || "http://127.0.0.1:3333";
const OUT_DIR = __dirname;
const args = process.argv.slice(2);
const FLAG = (k) => args.includes(k);
const VAL = (k, def) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : def;
};
const APPLY = FLAG("--apply");
const YES = FLAG("--yes");
const MIN_SCORE = parseInt(VAL("--min-score", "5"), 10);
const LIMIT = VAL("--limit") ? parseInt(VAL("--limit"), 10) : 0;
const ONLY = VAL("--only", "");
const SAMPLE = parseInt(VAL("--sample", "3"), 10);

const STOP = new Set(["the","and","for","pro","app","api","web","free","all","new","with","from","that","this","using","use","into","your","yang","dan","untuk","dari","ke","di","atau","pada","dengan","akan","adalah","the"]);

function timeoutFetch(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
const getJSON = (u) => timeoutFetch(u).then((r) => r.json());
const postJSON = (u, b) => timeoutFetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const del = (u) => timeoutFetch(u, { method: "DELETE" }).then((r) => r.status);

function tok(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
function distinct(s) {
  const parts = String(s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return [...new Set(parts)];
}

function buildProfiles(projects) {
  return projects.map((p) => {
    const basename = (p.path || "").split("/").filter(Boolean).pop() || "";
    const strong = new Set([
      ...tok(p.name).filter((w) => w.length >= 3 && !STOP.has(w)),
      ...tok(basename).filter((w) => w.length >= 3 && !STOP.has(w)),
      ...distinct(p.name),
      ...distinct(basename),
    ]);
    const weak = new Set([
      ...((p.tech_stack || []).flatMap((t) => distinct(t))),
      ...distinct(p.description),
    ]);
    return { id: p.id, name: p.name, strong, weak };
  });
}

function score(text, profiles) {
  const words = new Set(tok(text));
  let best = null;
  const ranked = [];
  for (const p of profiles) {
    let strongHits = 0;
    for (const s of p.strong) if (words.has(s)) strongHits++;
    let weakHits = 0;
    for (const w of p.weak) if (words.has(w)) weakHits++;
    const scoreVal = Math.min(strongHits, 3) * 4 + Math.min(weakHits, 5) * 1;
    ranked.push({ name: p.name, id: p.id, score: scoreVal, strongHits, weakHits });
    if (!best || scoreVal > best.score) best = ranked[ranked.length - 1];
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked[0] || { score: 0 };
  const second = ranked[1] || { score: 0 };
  const margin = top.score - second.score;
  return { best: top, second, margin };
}

async function fetchUnscoped() {
  const all = [];
  let offset = 0;
  const pageSize = 500;
  let total = 0;
  do {
    const res = await getJSON(`${BASE}/v1/admin/memories?project_id=null&limit=${pageSize}&offset=${offset}`);
    if (!res || !res.success) throw new Error("Failed to fetch memories: " + JSON.stringify(res));
    total = res.total;
    all.push(...(res.memories || []));
    offset += pageSize;
  } while (offset < total && (!LIMIT || all.length < LIMIT));
  return { memories: LIMIT ? all.slice(0, LIMIT) : all, total };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const health = await getJSON(`${BASE}/health`).catch(() => null);
  if (!health) {
    console.error("memory-bridge-down: " + BASE + " tidak merespon. Set MC_BASE jika beda.");
    process.exit(1);
  }

  const projRes = await getJSON(`${BASE}/v1/admin/projects`);
  const profiles = buildProfiles(projRes.projects || []);
  console.log(`Projects terdaftar: ${profiles.map((p) => p.name).join(", ") || "(none)"}`);

  const { memories, total } = await fetchUnscoped();
  console.log(`Unscoped total: ${total} | diproses: ${memories.length}`);

  const proposals = [];
  const perProject = {};
  let unmatched = 0;
  for (const m of memories) {
    const text = [m.title, m.content, (m.tags || []).join(" ")].join(" ");
    const { best, margin } = score(text, profiles);
    if (best.score >= MIN_SCORE && best.strongHits >= 1 && margin >= 1) {
      proposals.push({ id: m.id, type: m.type, title: m.title, content: m.content, tags: m.tags || [], to: best.name, score: best.score, strongHits: best.strongHits, weakHits: best.weakHits });
      perProject[best.name] = (perProject[best.name] || 0) + 1;
    } else {
      unmatched++;
    }
  }

  const ts = stamp();
  const backupPath = path.join(OUT_DIR, `backfill-backup-${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ exportedAt: new Date().toISOString(), total, memories }, null, 2));
  const propPath = path.join(OUT_DIR, `backfill-proposals-${ts}.json`);
  fs.writeFileSync(propPath, JSON.stringify({ minScore: MIN_SCORE, total, unmatched, perProject, proposals }, null, 2));

  console.log("\n=== DRY-RUN REPORT ===");
  console.log(`Threshold min-score=${MIN_SCORE} (margin>=1)`);
  console.log(`Akan di-scope: ${proposals.length} | Tidak cocok (dibiarkan unscoped): ${unmatched}`);
  console.log("\nPer project:");
  for (const [name, n] of Object.entries(perProject)) console.log(`  ${name.padEnd(20)} ${n}`);
  console.log(`\nContoh proposal (max ${SAMPLE} per project):`);
  const byProj = {};
  for (const p of proposals) (byProj[p.to] = byProj[p.to] || []).push(p);
  for (const [name, list] of Object.entries(byProj)) {
    console.log(`\n  [${name}]`);
    for (const p of list.slice(0, SAMPLE)) console.log(`    score=${p.score}  ${String(p.title || "").slice(0, 75)}`);
  }
  console.log(`\nBackup : ${backupPath}`);
  console.log(`Report : ${propPath}`);

  if (!APPLY) {
    console.log("\nDry-run only. Untuk benar-benar re-scope, jalankan: node scripts/backfill-scoping.cjs --apply [--yes] [--min-score N] [--only PROJECT]");
    return;
  }

  const todo = ONLY ? proposals.filter((p) => p.to === ONLY) : proposals;
  if (!todo.length) {
    console.log("\nTidak ada proposal untuk di-apply (cek --only / threshold).");
    return;
  }
  if (!YES) {
    console.log(`\nAkan DELETE+re-create ${todo.length} memori. Ini merusak (created_at hilang, title di-regenerate).`);
    console.log("Tambahkan --yes untuk konfirmasi otomatis, atau hapus --apply untuk dry-run.");
    return;
  }

  console.log(`\nAPPLY: re-scoping ${todo.length} memori...`);
  let ok = 0, fail = 0;
  for (const p of todo) {
    const status = await del(`${BASE}/v1/admin/memories/${p.id}`);
    if (status !== 200) { fail++; console.log(`  SKIP (delete ${status}): ${p.id}`); continue; }
    const res = await postJSON(`${BASE}/v1/remember`, { content: p.content, type: p.type || "general", project_name: p.to, tags: p.tags });
    if (res && res.success) { ok++; } else { fail++; console.log(`  RECREATE FAIL: ${p.id} -> ${JSON.stringify(res).slice(0, 160)}`); }
  }
  console.log(`\nSelesai. Berhasil: ${ok} | Gagal: ${fail}`);
  const stats = await getJSON(`${BASE}/v1/admin/stats`);
  console.log(`Stats sekarang -> total: ${stats.memoryCount} | unscoped: ${stats.unscoped}`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
