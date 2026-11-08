import { useEffect, useState } from "react";
import { X, Loader2, ThumbsUp, ThumbsDown, FolderInput, GitMerge, Trash2, Search, ArrowRight, Clock, Eye } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "./TypeBadge.jsx";
import RelatedPanel from "./RelatedPanel.jsx";
import { cn, formatDate, typeMeta } from "../lib.jsx";

export default function MemoryDetailModal({ memoryId, projects = [], onClose, onChanged }) {
  const [memory, setMemory] = useState(null);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [superSearch, setSuperSearch] = useState(false);
  const [superQuery, setSuperQuery] = useState("");
  const [superResults, setSuperResults] = useState([]);

  const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.getMemory(memoryId), api.chain(memoryId).catch(() => null)])
      .then(([m, c]) => {
        if (!alive) return;
        setMemory(m.memory || null);
        setChain(c);
        setSuperQuery((m.memory?.title || "").slice(0, 80));
      })
      .catch(() => alive && setMemory(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [memoryId]);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  const doFeedback = async (useful) => {
    setBusy("feedback");
    try {
      await api.feedback(memory.id, useful);
      flash(useful ? "Ditandai berguna — naik di ranking berikutnya" : "Ditandai tidak membantu — tenggelam di ranking berikutnya");
      const m = await api.getMemory(memory.id);
      setMemory(m.memory);
      onChanged?.();
    } catch (e) {
      flash("Gagal: " + e.message);
    } finally {
      setBusy("");
    }
  };

  const doRescope = async (projectId) => {
    setBusy("rescope");
    try {
      await api.updateMemory(memory.id, { project_id: projectId || null });
      flash(projectId ? `Dipindah ke ${projectName[projectId] || projectId.slice(0, 8)}` : "Dilepas dari proyek (unscoped)");
      onChanged?.();
    } catch (e) {
      flash("Gagal: " + e.message);
    } finally {
      setBusy("");
    }
  };

  const doSupersede = async (replacementId) => {
    setBusy("supersede");
    try {
      await api.updateMemory(memory.id, { superseded_by: replacementId });
      flash("Ditandai usang — digantikan memori terpilih");
      const c = await api.chain(memory.id).catch(() => null);
      setChain(c);
      setSuperSearch(false);
      onChanged?.();
    } catch (e) {
      flash("Gagal: " + e.message);
    } finally {
      setBusy("");
    }
  };

  const doDelete = async () => {
    if (!confirm("Hapus memori ini permanen?")) return;
    setBusy("delete");
    try {
      await api.deleteMemory(memory.id);
      onChanged?.();
      onClose();
    } catch (e) {
      flash("Gagal: " + e.message);
      setBusy("");
    }
  };

  const searchReplacements = async () => {
    if (!superQuery.trim()) return;
    setBusy("supersearch");
    try {
      const r = await api.recall({ query: superQuery, limit: 8, reranking: false });
      setSuperResults((r.results || []).filter((x) => x.id !== memory.id));
    } catch {
      setSuperResults([]);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
        ) : !memory ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-500">Memori tidak ditemukan.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-white/[0.06] p-5">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <TypeBadge type={memory.type} />
                  {memory.project_id && projectName[memory.project_id] && (
                    <span className="rounded-md bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{projectName[memory.project_id]}</span>
                  )}
                  {memory.superseded_by && (
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">USANG</span>
                  )}
                </div>
                <h3 className="text-base font-semibold leading-snug text-slate-900 dark:text-white">{memory.title || "(tanpa judul)"}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(memory.created_at)}</span>
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> akses {memory.access_count ?? 0}</span>
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {memory.useful_count ?? 0} / {memory.not_useful_count ?? 0}</span>
                </div>
              </div>
              <button onClick={onClose} className="btn btn-ghost !p-1.5"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{memory.content}</p>
              {memory.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {memory.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">#{t}</span>
                  ))}
                </div>
              )}
            </div>

            {chain && (chain.successor || (chain.predecessors && chain.predecessors.length > 0)) && (
              <div className="mx-5 mb-4 rounded-lg bg-slate-50 dark:bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><GitMerge className="h-3.5 w-3.5" /> Rantai versi</div>
                <div className="space-y-1 text-xs">
                  {chain.predecessors?.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-slate-500 dark:text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span className="truncate">{p.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px]">{(p.created_at || "").slice(0, 10)} digantikan</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="truncate">{memory.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-emerald-600 dark:text-emerald-300">aktif</span>
                  </div>
                  {chain.successor && (
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <ArrowRight className="h-3 w-3" />
                      <span className="truncate">{chain.successor.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px]">pengganti</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-slate-200 dark:border-white/[0.06] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Aksi:</span>
                <button onClick={() => doFeedback(true)} disabled={!!busy} className="btn btn-ghost !py-1 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10">
                  <ThumbsUp className="h-3 w-3" /> Berguna
                </button>
                <button onClick={() => doFeedback(false)} disabled={!!busy} className="btn btn-ghost !py-1 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-500/10">
                  <ThumbsDown className="h-3 w-3" /> Tidak membantu
                </button>
                {!memory.superseded_by && (
                  <button onClick={() => setSuperSearch((s) => !s)} disabled={!!busy} className="btn btn-ghost !py-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                    <GitMerge className="h-3 w-3" /> Tandai usang…
                  </button>
                )}
                <button onClick={doDelete} disabled={!!busy} className="btn btn-danger !py-1 text-xs">
                  <Trash2 className="h-3 w-3" /> Hapus
                </button>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                {msg && <span className="text-xs text-emerald-700 dark:text-emerald-300">{msg}</span>}
              </div>

              {superSearch && (
                <div className="rounded-lg bg-slate-50 dark:bg-white/[0.02] p-3">
                  <div className="mb-2 text-xs text-slate-500 dark:text-slate-500">Cari memori pengganti (yang ini akan ditandai usang, bukan dihapus):</div>
                  <div className="flex gap-2">
                    <input
                      className="input !py-1.5 text-xs"
                      value={superQuery}
                      onChange={(e) => setSuperQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchReplacements()}
                      placeholder="kata kunci…"
                    />
                    <button onClick={searchReplacements} disabled={!!busy} className="btn btn-primary !py-1.5 text-xs shrink-0">
                      {busy === "supersearch" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Cari
                    </button>
                  </div>
                  {superResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {superResults.map((r) => {
                        const meta = typeMeta(r.type);
                        return (
                          <button
                            key={r.id}
                            onClick={() => doSupersede(r.id)}
                            disabled={!!busy}
                            className="flex w-full items-center gap-2 rounded-md bg-white dark:bg-white/[0.03] px-2.5 py-1.5 text-left ring-1 ring-slate-200 dark:ring-white/[0.06] hover:ring-emerald-400 dark:hover:ring-emerald-500/50"
                          >
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{r.title}</span>
                            <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">sim {r.similarity}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <FolderInput className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span className="text-xs text-slate-500 dark:text-slate-500">Pindah proyek:</span>
                <select
                  className="input !w-auto !py-1 text-xs"
                  value={memory.project_id || ""}
                  disabled={!!busy}
                  onChange={(e) => doRescope(e.target.value || null)}
                >
                  <option value="">— unscoped —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <RelatedPanel memory={memory} projectName={projectName} />
          </>
        )}
      </div>
    </div>
  );
}
