import { useState } from "react";
import { Search, Loader2, BrainCircuit, Sliders, X } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import FeedbackButtons from "../components/FeedbackButtons.jsx";
import RelatedPanel from "../components/RelatedPanel.jsx";
import { ALL_TYPES, typeMeta, cn } from "../lib.jsx";

const EXAMPLES = [
  "cara backup database otomatis",
  "enkripsi kode sumber",
  "zod optional menerima null",
  "transfer pola lintas project",
  "auto-backup schedule"
];

export default function Recall({ projects = [] }) {
  const [query, setQuery] = useState("");
  const [projectSel, setProjectSel] = useState("");
  const [typeSel, setTypeSel] = useState("");
  const [limit, setLimit] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ver, setVer] = useState(0);

  const run = async (e, q) => {
    const finalQuery = (q ?? query).trim();
    if (e) e.preventDefault();
    if (!finalQuery) return;
    if (q != null) setQuery(q);
    setLoading(true);
    setError("");
    const body = { query: finalQuery, limit };
    if (projectSel) body.project_name = projectSel;
    if (typeSel) body.type = typeSel;
    try {
      const r = await api.recall(body);
      setData(r);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const projectName = (() => {
    const map = {};
    projects.forEach((p) => (map[p.id] = p.name));
    return map;
  })();
  const results = data?.results || [];
  const bump = () => setVer((v) => v + 1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Recall</h2>
        <p className="text-sm text-slate-500">
          Cari memori secara semantik — uji sendiri ingatan & kepintaran sistem. Hasil diurutkan similarity + utility.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={run} className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tanya / cari dalam bahasa apa saja…"
            className="input !pl-9"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost !p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select value={projectSel} onChange={(e) => setProjectSel(e.target.value)} className="input !w-auto min-w-[150px]">
          <option value="">Semua project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select value={typeSel} onChange={(e) => setTypeSel(e.target.value)} className="input !w-auto min-w-[120px]">
          <option value="">Semua tipe</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{typeMeta(t).label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Sliders className="h-3.5 w-3.5" />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="input !w-auto !py-1.5 text-xs">
            {[5, 8, 12, 20].map((n) => (
              <option key={n} value={n}>top {n}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading || !query.trim()} className="btn btn-primary !py-2 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />} Cari
        </button>
      </form>

      {/* Examples */}
      {!data && !loading && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-600">Contoh:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={(e) => run(e, ex)} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-200">
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div className="card p-4 text-sm text-rose-300">Gagal: {error}</div>}

      {/* Meta */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>{results.length} hasil</span>
          <span className="font-mono">mode: {data.mode}</span>
          {data.reranked && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">reranked</span>}
          <span className="font-mono">dicari di {data.total_searched} memori</span>
        </div>
      )}

      {/* Results */}
      {results.map((r, i) => {
        const meta = typeMeta(r.type);
        const sim = Math.round((r.similarity ?? 0) * 100);
        return (
          <div key={r.id + "-" + i} className="card overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5 font-mono text-[11px] text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={r.type} size="xs" />
                  {r.project_id && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{projectName[r.project_id] || "scoped"}</span>
                  )}
                  <ScoreBar label="match" value={sim} tone="sky" />
                  <ScoreBar label="conf" value={Math.round((r.confidence ?? 0) * 100)} tone="emerald" />
                  <ScoreBar label="util" value={Math.round((r.utility ?? 0.5) * 100)} tone="violet" />
                </div>
                <p className="mt-1.5 text-sm font-medium text-slate-100">{r.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.content}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4 py-2">
              <FeedbackButtons key={r.id + ver} memory={r} />
              <span className="font-mono text-[10px] text-slate-600">access {r.access_count ?? 0}</span>
            </div>
            <RelatedPanel key={"rel-" + r.id + ver} memory={r} projectName={projectName} />
          </div>
        );
      })}

      {data && results.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-16 text-slate-600">
          <BrainCircuit className="h-8 w-8" />
          <p className="text-sm">Tidak ada memori cocok. Coba kata kunci lain atau perluas filter.</p>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, tone }) {
  const tones = { sky: "bg-sky-400 text-sky-300", emerald: "bg-emerald-400 text-emerald-300", violet: "bg-violet-400 text-violet-300" };
  const [bar, text] = tones[tone].split(" ");
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[9px] text-slate-600">{label}</span>
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
        <span className={cn("absolute left-0 top-0 h-full rounded-full", bar)} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className={cn("font-mono text-[10px]", text)}>{value}</span>
    </span>
  );
}
