import { useEffect, useState } from "react";
import { Link2, Loader2, ChevronDown } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "./TypeBadge.jsx";
import { cn, typeMeta } from "../lib.jsx";

export default function RelatedPanel({ memory, projectName }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    setError("");
    api
      .related(memory.id)
      .then((r) => setData(r))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const related = data?.related || [];

  return (
    <div className="border-t border-white/[0.06]">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-slate-400 hover:text-slate-200"
      >
        <Link2 className="h-3.5 w-3.5" />
        Memori terkait (knowledge graph)
        {data && <span className="font-mono text-slate-600">{related.length}</span>}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat…</div>
          ) : error ? (
            <div className="py-2 text-xs text-rose-300">Gagal: {error}</div>
          ) : related.length === 0 ? (
            <div className="py-2 text-xs text-slate-600">Tidak ada memori terkait (entitas tumpang tindih kosong).</div>
          ) : (
            <div className="space-y-1.5">
              {related.map((r) => {
                const meta = typeMeta(r.type);
                return (
                  <div key={r.id} className="flex items-start gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5">
                    <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{r.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={r.type} size="xs" />
                        {r.project_id && projectName?.[r.project_id] && (
                          <span className="rounded bg-white/5 px-1 py-0.5 font-mono text-[9px] text-slate-500">{projectName[r.project_id]}</span>
                        )}
                        {r.shared?.slice(0, 4).map((s) => (
                          <span key={s} className="rounded bg-sky-500/10 px-1 py-0.5 font-mono text-[9px] text-sky-300">#{s}</span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" title="entitas/shared">×{r.shared_entities}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
