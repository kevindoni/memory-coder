#!/usr/bin/env node
// Codemod: kelas dark-hardcoded -> light+dark dual-mode (prefix variant aware).
// Satu pass: regex alternation, tidak ada re-entry pada hasil replace.
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "dashboard", "src");

// token -> [light, dark]
const DUAL = [
  ["text-white", "text-slate-900", "text-white"],
  ["text-slate-200", "text-slate-700", "text-slate-200"],
  ["text-slate-300", "text-slate-600", "text-slate-300"],
  ["text-slate-400", "text-slate-500", "text-slate-400"],
  ["text-slate-500", "text-slate-400", "text-slate-500"],
  ["text-slate-600", "text-slate-400", "text-slate-600"],
  ["text-sky-300", "text-emerald-600", "text-emerald-300"],
  ["text-sky-400", "text-emerald-600", "text-emerald-300"],
  ["text-rose-300", "text-rose-600", "text-rose-300"],
  ["text-amber-300", "text-amber-600", "text-amber-300"],
  ["text-violet-300", "text-violet-600", "text-violet-300"],
  ["text-emerald-300", "text-emerald-600", "text-emerald-300"],
  ["bg-slate-950/60", "bg-white/80", "bg-slate-950/60"],
  ["bg-slate-950/80", "bg-slate-900/30", "bg-slate-950/80"],
  ["bg-slate-950", "bg-slate-100", "bg-slate-950"],
  ["bg-slate-900/60", "bg-white", "bg-slate-900/60"],
  ["bg-slate-900/50", "bg-white", "bg-slate-900/50"],
  ["bg-slate-900/40", "bg-white", "bg-slate-900/40"],
  ["bg-slate-900", "bg-white", "bg-slate-900"],
  ["bg-slate-800/60", "bg-slate-100", "bg-slate-800/60"],
  ["bg-slate-800", "bg-slate-100", "bg-slate-800"],
  ["bg-slate-700", "bg-slate-200", "bg-slate-700"],
  ["bg-white/[0.07]", "bg-emerald-500/10", "bg-white/[0.07]"],
  ["bg-white/[0.06]", "bg-emerald-500/10", "bg-white/[0.06]"],
  ["bg-white/[0.04]", "bg-slate-100", "bg-white/[0.04]"],
  ["bg-white/[0.025]", "bg-slate-50", "bg-white/[0.025]"],
  ["bg-white/10", "bg-slate-100", "bg-white/10"],
  ["bg-white/5", "bg-slate-100", "bg-white/5"],
  ["border-white/[0.06]", "border-slate-200", "border-white/[0.06]"],
  ["border-white/20", "border-slate-300", "border-white/20"],
  ["border-white/10", "border-slate-200", "border-white/10"],
  ["border-white/5", "border-slate-200/70", "border-white/5"],
  ["divide-white/10", "divide-slate-200", "divide-white/10"],
  ["divide-white/5", "divide-slate-200", "divide-white/5"],
  ["ring-white/10", "ring-slate-200", "ring-white/10"],
  ["ring-white/5", "ring-slate-200", "ring-white/5"]
];

const byToken = new Map(DUAL.map(([tok, l, d]) => [tok, [l, d]]));
// alternation: longest token first supaya bg-slate-950/60 menang atas bg-slate-950
const tokens = [...byToken.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\/]/g, (ch) => "\\" + ch));
const re = new RegExp("((?:[a-zA-Z-]+:)*)(" + tokens.join("|") + ")", "g");

function dualize(src) {
  let count = 0;
  const out = src.replace(re, (m, prefix, token) => {
    const [l, d] = byToken.get(token);
    count++;
    return `${prefix}${l} ${prefix}dark:${d}`;
  });
  // aksen sky -> emerald untuk sisanya (bg/ring/border/hover)
  let skyCount = 0;
  const out2 = out.replace(/sky-/g, () => { skyCount++; return "emerald-"; });
  return { out: out2, count, skyCount };
}

function walk(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else if (/\.(jsx?|js)$/.test(e.name) && e.name !== "index.css") files.push(p);
  }
  return files;
}

let total = 0;
for (const f of walk(SRC)) {
  const src = fs.readFileSync(f, "utf-8");
  const { out, count, skyCount } = dualize(src);
  if (out !== src) {
    fs.writeFileSync(f, out);
    total += count + skyCount;
    console.log(`${path.relative(SRC, f)}: ${count + skyCount} kelas`);
  }
}
console.log(`TOTAL: ${total} transformasi`);
