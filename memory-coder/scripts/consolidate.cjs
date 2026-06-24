#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = process.env.MC_BASE || "http://127.0.0.1:3333";
const OUT_DIR = __dirname;
const args = process.argv.slice(2);
const FLAG = (k) => args.includes(k);
const VAL = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const APPLY = FLAG("--apply");
const YES = FLAG("--yes");
const DUP_THRESHOLD = parseFloat(VAL("--dup", "0.82"));
const CONFLICT_LO = parseFloat(VAL("--cmin", "0.4"));
const CONFLICT_HI = parseFloat(VAL("--cmax", "0.75"));
const ONLY_PROJECT = VAL("--only", "");

function timeoutFetch(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
const getJSON = (u) => timeoutFetch(u).then((r) => r.json());

const STOP = new Set("the and for pro app api web with from that this using use into your a an of to in is are was be on at by it as or yang dan untuk dari ke di atau pada dengan akan adalah tidak jika saat itu ini function const let var return import export class new if else then".split(" "));
function tok(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; const small = a.size < b.size ? a : b, big = a.size < b.size ? b : a;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function quality(m) {
  return (m.useful_count || 0) - (m.not_useful_count || 0) + (m.access_count || 0) * 0.1 + (new Date(m.created_at).getTime() / 1e12);
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

async function main() {
  const health = await getJSON(`${BASE}/health`).catch(() => null);
  if (!health) { console.error("memory-bridge-down"); process.exit(1); }

  let mems = (await fetchAll()).filter((m) => !m.superseded_by);
  if (ONLY_PROJECT) mems = mems.filter((m) => m.project_id === ONLY_PROJECT || m.project_name === ONLY_PROJECT);

  const byBlock = new Map();
  for (const m of mems) {
    const key = `${m.project_id || "null"}|${m.type}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(m);
  }

  const duplicates = [];
  const conflicts = [];
  for (const [, group] of byBlock) {
    const sets = group.map((m) => ({ m, set: new Set(tok(`${m.title} ${m.content}`)) }));
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const sim = jaccard(sets[i].set, sets[j].set);
        if (sim >= DUP_THRESHOLD) duplicates.push({ a: sets[i].m, b: sets[j].m, sim });
        else if (sets[i].m.type === "decision" && sets[j].m.type === "decision" && sim >= CONFLICT_LO && sim <= CONFLICT_HI) {
          conflicts.push({ a: sets[i].m, b: sets[j].m, sim });
        }
      }
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dupClusters = [];
  const toDelete = new Set();
  for (const d of duplicates) {
    const keep = quality(d.a) >= quality(d.b) ? d.a : d.b;
    const drop = keep === d.a ? d.b : d.a;
    toDelete.add(drop.id);
    dupClusters.push({ keep: { id: keep.id, title: keep.title }, drop: { id: drop.id, title: drop.title }, sim: d.sim });
  }

  console.log("=== CONSOLIDATION REPORT ===");
  console.log(`Memori dianalisis: ${mems.length} (superseded diabaikan)`);
  console.log(`Duplikat terdeteksi: ${dupClusters.length} pasang -> ${toDelete.size} kandidat hapus`);
  console.log(`Konflik decision (review manual): ${conflicts.length} pasang`);
  console.log(`Threshold dup Jaccard>=${DUP_THRESHOLD}, conflict ${CONFLICT_LO}-${CONFLICT_HI}`);
  if (dupClusters.length) {
    console.log("\nContoh duplikat:");
    for (const c of dupClusters.slice(0, 10)) console.log(`  sim=${c.sim.toFixed(2)} KEEP "${c.keep.title.slice(0,50)}" | DROP "${c.drop.title.slice(0,50)}"`);
  }
  if (conflicts.length) {
    console.log("\nContoh kemungkinan konflik decision (TIDAK auto-act):");
    for (const c of conflicts.slice(0, 10)) console.log(`  sim=${c.sim.toFixed(2)}  A:"${c.a.title.slice(0,45)}"  <>  B:"${c.b.title.slice(0,45)}"`);
  }

  fs.writeFileSync(path.join(OUT_DIR, `consolidate-backup-${ts}.json`), JSON.stringify(mems, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `consolidate-report-${ts}.json`), JSON.stringify({ duplicates: dupClusters, conflicts, deleteIds: [...toDelete] }, null, 2));
  console.log(`\nBackup : consolidate-backup-${ts}.json`);
  console.log(`Report : consolidate-report-${ts}.json`);

  if (!APPLY || !YES) {
    console.log("\nDry-run. Jalankan --apply --yes untuk menghapus duplikat (konflik TIDAK dihapus otomatis).");
    return;
  }
  let ok = 0, fail = 0;
  for (const id of toDelete) {
    const st = await timeoutFetch(`${BASE}/v1/admin/memories/${id}`, { method: "DELETE" }).then((r) => r.status).catch(() => 0);
    if (st === 200) ok++; else fail++;
  }
  console.log(`\nAPPLY: hapus ${ok} duplikat, gagal ${fail}. Konflik tetap manual.`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
