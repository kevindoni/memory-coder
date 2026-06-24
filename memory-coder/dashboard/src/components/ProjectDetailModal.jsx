import { useEffect, useState } from "react";
import { X, Loader2, Boxes, Sparkles, GitCompare } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "./TypeBadge.jsx";
import { ALL_TYPES, typeMeta, cn, truncate } from "../lib.jsx";

export default function ProjectDetailModal({ project, onClose }) {
  const [mems, setMems] = useState(null);
  const [sug, setSug] = useState(null);
  const [loadingSug, setLoadingSug] = useState(false);

  useEffect(() => {
    if (!project) return;
    api.memories({ project_id: project.id, limit: 500 }).then((r) => setMems(r.memories || [])).catch(() => setMems([]));
  }, [project]);

  useEffect(() => {
    if (!project) return;
    setLoadingSug(true);
    api.suggestPatterns(project.name).then(setSug).catch(() => {}).finally(() => setLoadingSug(false));
  }, [project]);

  if (!project) return null;
  const byType = {};
  ALL_TYPES.forEach((t) => (byType[t] = (mems || []).filter((m) => m.type === t).length));
  const recent = (mems || []).slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{project.name}</h3>
            <p className="text-xs text-slate-500">{project.description || "Tanpa deskripsi"}</p>
            <div className="mt-1 font-mono text-[10px] text-slate-600">{project.path}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {(project.tech_stack || []).map((t) => (
            <span key={t} className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{t}</span>
          ))}
        </div>

        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300"><Boxes className="h-3.5 w-3.5 text-sky-300" /> Breakdown tipe ({mems?.length ?? "…"} memori)</h4>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TYPES.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300">
                <span className={cn("h-1.5 w-1.5 rounded-full", typeMeta(t).dot)} /> {typeMeta(t).label} <b className="font-mono">{byType[t]}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium text-slate-300">Memori terbaru</h4>
          <div className="space-y-1">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", typeMeta(m.type).dot)} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{m.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300"><GitCompare className="h-3.5 w-3.5 text-violet-300" /> Pola dari project lain</h4>
          {loadingSug ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat…</div>
          ) : (sug?.suggestions || []).length === 0 ? (
            <p className="text-[11px] text-slate-600">Tidak ada pola lintas-project yang berbagi tag/tech.</p>
          ) : (
            <div className="space-y-1">
              {(sug?.suggestions || []).slice(0, 5).map((s) => (
                <div key={s.id} className="rounded-md bg-white/[0.02] px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <TypeBadge type={s.type} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{s.title}</span>
                    <span className="font-mono text-[10px] text-slate-500">← {s.from_project || "?"}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{truncate(s.content, 120)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
