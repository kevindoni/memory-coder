import { useEffect, useMemo, useState } from "react";
import { Network, Loader2, Hash } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import { cn, typeMeta } from "../lib.jsx";

export default function Graph({ projects = [] }) {
  const [mems, setMems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState("");

  useEffect(() => {
    api.memories({ limit: 400 }).then((r) => setMems(r.memories || [])).finally(() => setLoading(false));
  }, []);

  const projectName = useMemo(() => { const m = {}; projects.forEach((p) => (m[p.id] = p.name)); return m; }, [projects]);

  const tagCount = useMemo(() => {
    const c = {};
    for (const m of mems) for (const t of m.tags || []) c[t] = (c[t] || 0) + 1;
    return Object.entries(c).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [mems]);

  const linked = useMemo(() => {
    if (!sel) return [];
    return mems.filter((m) => (m.tags || []).includes(sel));
  }, [sel, mems]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Graph</h2>
        <p className="text-sm text-slate-500">Hub entitas — jelajahi memori lewat tag. Klik entitas untuk lihat memori yang terhubung.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
      ) : (
        <>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Network className="h-4 w-4 text-sky-300" /> Entitas teratas (tag dengan ≥2 memori)</h3>
            <div className="flex flex-wrap gap-1.5">
              {tagCount.length === 0 && <span className="text-xs text-slate-600">Belum ada tag.</span>}
              {tagCount.map(([tag, n]) => {
                const size = Math.min(20, 11 + n);
                return (
                  <button
                    key={tag}
                    onClick={() => setSel(sel === tag ? "" : tag)}
                    className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono transition-colors", sel === tag ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40" : "bg-white/5 text-slate-300 hover:bg-white/10")}
                    style={{ fontSize: `${size}px` }}
                  >
                    <Hash className="h-3 w-3" />{tag}
                    <span className="text-[10px] opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {sel && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">Memori terhubung ke <span className="font-mono text-sky-300">#{sel}</span> — {linked.length}</h3>
              <div className="space-y-1.5">
                {linked.map((m) => {
                  const meta = typeMeta(m.type);
                  return (
                    <div key={m.id} className="flex items-start gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5">
                      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-200">{m.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={m.type} size="xs" />
                          {m.project_id && projectName[m.project_id] && <span className="rounded bg-white/5 px-1 py-0.5 font-mono text-[9px] text-slate-500">{projectName[m.project_id]}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
