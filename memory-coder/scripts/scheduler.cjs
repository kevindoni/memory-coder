#!/usr/bin/env node
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const SCRIPTS = __dirname;
const STATE_FILE = path.join(SCRIPTS, ".scheduler-state.json");
const LOG = (msg) => console.log(`[scheduler ${new Date().toISOString()}] ${msg}`);

const EVAL_HOUR = parseInt(process.env.SCHED_EVAL_HOUR || "3", 10);
const CONSOLIDATE_WEEKDAY = parseInt(process.env.SCHED_CONSOLIDATE_WEEKDAY || "0", 10);
const CONSOLIDATE_HOUR = parseInt(process.env.SCHED_CONSOLIDATE_HOUR || "4", 10);
const CONSOLIDATE_APPLY = process.env.SCHED_CONSOLIDATE_APPLY === "true";
const TICK_MS = 60_000;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function weekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function runScript(file, args = []) {
  return new Promise((resolve) => {
    LOG(`run: node ${file} ${args.join(" ")}`);
    const child = spawn(process.execPath, [path.join(SCRIPTS, file), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("close", (code) => {
      LOG(`${file} exit=${code}`);
      const tail = out.split(/\r?\n/).filter(Boolean).slice(-6).join(" | ");
      if (tail) LOG(`tail: ${tail}`);
      resolve({ code, out });
    });
    child.on("error", (e) => { LOG(`${file} error: ${e.message}`); resolve({ code: 1, out: "" }); });
  });
}

async function maybeRunEval(state) {
  const now = new Date();
  if (now.getHours() < EVAL_HOUR) return;
  if (state.lastEval === todayKey()) return;
  LOG("eval: running paraphrase golden set (meaningful metric)");
  await runScript("eval-recall.cjs", ["--file", "golden-qa-paraphrase.json"]);
  state.lastEval = todayKey();
  saveState(state);
}

async function maybeRunConsolidate(state) {
  const now = new Date();
  if (now.getDay() !== CONSOLIDATE_WEEKDAY || now.getHours() < CONSOLIDATE_HOUR) return;
  if (state.lastConsolidate === weekKey()) return;
  const args = CONSOLIDATE_APPLY ? ["--apply", "--yes"] : [];
  LOG(`consolidate: ${CONSOLIDATE_APPLY ? "APPLY (hapus dup)" : "dry-run report saja"}`);
  await runScript("consolidate.cjs", args);
  state.lastConsolidate = weekKey();
  saveState(state);
}

async function tick() {
  const state = loadState();
  try { await maybeRunEval(state); } catch (e) { LOG("eval error: " + e.message); }
  try { await maybeRunConsolidate(state); } catch (e) { LOG("consolidate error: " + e.message); }
}

async function main() {
  const immediate = process.argv.slice(2);
  if (immediate.includes("--run-eval")) { await runScript("eval-recall.cjs", ["--file", "golden-qa-paraphrase.json"]); return; }
  if (immediate.includes("--run-consolidate")) { await runScript("consolidate.cjs", CONSOLIDATE_APPLY ? ["--apply", "--yes"] : []); return; }

  LOG(`started. eval daily @${EVAL_HOUR}:00, consolidate weekly (weekday ${CONSOLIDATE_WEEKDAY}) @${CONSOLIDATE_HOUR}:00, apply=${CONSOLIDATE_APPLY}`);
  await tick();
  setInterval(tick, TICK_MS);
}

main().catch((e) => { LOG("fatal: " + e.message); process.exit(1); });
