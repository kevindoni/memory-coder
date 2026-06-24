import { useEffect, useMemo, useState } from "react";
import { Sparkles, ThumbsUp, ThumbsDown, ArrowRight, Loader2, GitCompare, TrendingUp } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import { cn, typeMeta, truncate } from "../lib.jsx";

export default function Learning({ projects = [] }) {
  const [sample, setSample] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errSample, setErrSample] = useState("");

  const [proj, setProj] = useState(projects[0]?.name || "");
  const [sug, setSug] = useState(null);
  const [loadingSug, setLoadingSug] = useState(false);
  const [errSug, setErrSug] = useState("");

  useEffect(() => {
    if (!proj && projects[0]) setProj(projects[0].name);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSample = () => {
    setLoading(true);
    setErrSample("");
    api
      .memories({ limit: 200 })
      .then((r) => setSample(r.memories || []))
      .catch((e) => setErrSample(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSample();
  }, []);

  const projectName = useMemo(() => {
    const map = {};
    projects.forEach((p) => (map[p.id] = p.name));
    return map;
  }, [projects]);

  const topUseful = useMemo(
    () => [...sample].sort((a, b) => (b.useful_count || 0) - (a.useful_count || 0)).filter((m) => (m.useful_count || 0) > 0).slice(0, 6),
    [sample]
  );
  const topFlagged = useMemo(
    () => [...sample].sort((a, b) => (b.not_useful_count || 0) - (a.not_useful_count || 0)).filter((m) => (m.not_useful_count || 0) > 0).slice(0, 6),
    [sample]
  );
  const withFeedback = sample.filter((m) => (m.useful_count || 0) + (m.not_useful_count || 0) > 0).length;

  const runSuggest = () => {
    if (!proj) return;
    setLoadingSug(true);
    setErrSug("");
    setSug(null);
    api
      .suggestPatterns(proj)
      .then((r) => setSug(r))
      .catch((e) => setErrSug(e.message))
      .finally(() => setLoadingSug(false));
  };

  const Card = ({ m, mode }) => {
    const meta = typeMeta(m.type);
    return (
      <div className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-slate-200">{m.title}</p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{m.content}</p>
        </div>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]", mode === "up" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
          {mode === "up" ? `👍 ${m.useful_count}` : `👎 ${m.not_useful_count}`}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Learning</h2>
        <p className="text-sm text-slate-500">
          Insight dari loop feedback + transfer pengetahuan lintas-project. Memori yang ditandai berguna naik di recall; yang tidak membantu turun.
        </p>
      </div>

      {/* Feedback insights */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingUp className="h-4 w-4 text-sky-300" /> Sinyal feedback
          </h3>
          <span className="font-mono text-[10px] text-slate-500">
            {loading ? "…" : `${withFeedback}/${sample.length} memori (sampel 200 terbaru)`}
          </span>
        </div>
        {errSample ? (
          <div className="py-3 text-xs text-rose-300">Gagal: {errSample}</div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-300"><ThumbsUp className="h-3.5 w-3.5" /> Paling berguna</div>
              {topUseful.length ? topUseful.map((m) => <Card key={m.id} m={m} mode="up" />) : <Empty hint="Belum ada feedback 👍. Tandai memori di tab Memories." />}
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-300"><ThumbsDown className="h-3.5 w-3.5" /> Perlu ditinjau</div>
              {topFlagged.length ? topFlagged.map((m) => <Card key={m.id} m={m} mode="down" />) : <Empty hint="Belum ada memori yang ditandai 👎." />}
            </div>
          </div>
        )}
      </div>

      {/* Cross-project pattern transfer */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <GitCompare className="h-4 w-4 text-violet-300" /> Transfer pola lintas-project
        </h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={proj} onChange={(e) => setProj(e.target.value)} className="input !w-auto min-w-[180px]">
            <option value="">— pilih project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button onClick={runSuggest} disabled={!proj || loadingSug} className="btn btn-primary !py-1.5 text-xs">
            {loadingSug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Sarankan pola
          </button>
        </div>
        {errSug && <div className="py-2 text-xs text-rose-300">Gagal: {errSug}</div>}
        {sug && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              {sug.suggestions?.length || 0} pola/decision dari project lain yang berbagi tech stack/tag dengan <span className="text-slate-300">{sug.project}</span>.
            </p>
            {sug.suggestions?.length ? (
              sug.suggestions.map((s) => {
                const meta = typeMeta(s.type);
                return (
                  <div key={s.id} className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                      <TypeBadge type={s.type} size="xs" />
                      <span className="text-xs font-medium text-slate-200">{s.title}</span>
                      <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-slate-500">
                        <ArrowRight className="h-3 w-3" /> {s.from_project || "?"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">{truncate(s.content, 220)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {s.shared_tags?.map((t) => (
                        <span key={t} className="rounded bg-violet-500/10 px-1 py-0.5 font-mono text-[9px] text-violet-300">#{t}</span>
                      ))}
                      <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" title="utility (useful - not-useful)">util {s.utility}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty hint="Tidak ada pola dari project lain yang berbagi tag/tech. Tambah tag atau tech_stack agar bisa dicocokkan." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ hint }) {
  return <div className="rounded-lg border border-dashed border-white/[0.06] px-3 py-4 text-center text-[11px] text-slate-600">{hint}</div>;
}
