import { useEffect, useState } from "react";
import { FolderKanban, MapPin, Hash, ChevronRight, Loader2, GitBranch, Sparkles, CheckCircle2, AlertCircle, Info, Pencil } from "lucide-react";
import { api } from "../api.js";
import DeleteButton from "../components/DeleteButton.jsx";
import ProjectDetailModal from "../components/ProjectDetailModal.jsx";
import EditProjectModal from "../components/EditProjectModal.jsx";
import { timeAgo, cn } from "../lib.jsx";

export default function Projects({ signal, onOpenMemories, onNeedsRefresh }) {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [result, setResult] = useState({});
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = () => {
    setError("");
    api.projects().then((r) => setProjects(r.projects || [])).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (projects === null) load();
  }, []);

  useEffect(() => {
    if (signal > 0) load();
  }, [signal]);

  const handleDelete = async (id, name) => {
    await api.deleteProject(id);
    load();
  };

  const handleIndex = async (id) => {
    setBusy((s) => ({ ...s, [id]: "index" }));
    setResult((s) => ({ ...s, [id]: null }));
    try {
      const r = await api.indexProject(id);
      setResult((s) => ({ ...s, [id]: r }));
      load();
      onNeedsRefresh?.();
    } catch (e) {
      setResult((s) => ({ ...s, [id]: { success: false, error: e.message } }));
    } finally {
      setBusy((s) => ({ ...s, [id]: null }));
    }
  };

  const handleSmart = async (id) => {
    setBusy((s) => ({ ...s, [id]: "smart" }));
    setResult((s) => ({ ...s, [id]: null }));
    try {
      const r = await api.smartSummary(id);
      setResult((s) => ({ ...s, [id]: { ...r, kind: "smart" } }));
      load();
      onNeedsRefresh?.();
    } catch (e) {
      setResult((s) => ({ ...s, [id]: { success: false, error: e.message } }));
    } finally {
      setBusy((s) => ({ ...s, [id]: null }));
    }
  };

  if (error) return <div className="card p-6 text-sm text-rose-300">Gagal memuat: {error}</div>;
  if (projects === null)
    return (
      <div className="flex items-center gap-2 py-12 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat projects…
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <p className="text-sm text-slate-500">{projects.length} project terdaftar di memori</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="card group flex flex-col p-5 transition-colors hover:border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-inset ring-sky-500/20">
                  <FolderKanban className="h-5 w-5 text-sky-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{p.name}</h3>
                  <span className="font-mono text-[10px] text-slate-500">{timeAgo(p.last_active)}</span>
                </div>
              </div>
              <DeleteButton title="Hapus project + memori" onConfirm={() => handleDelete(p.id, p.name)} />
            </div>

            <p className="mt-3 line-clamp-2 text-xs text-slate-500">{p.description || "Tanpa deskripsi"}</p>

            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{p.path}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {p.tech_stack?.slice(0, 4).map((t) => (
                <span key={t} className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{t}</span>
              ))}
              {p.tech_stack?.length > 4 && (
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">+{p.tech_stack.length - 4}</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Hash className="h-3.5 w-3.5" />
                <span className="font-mono text-base font-semibold text-slate-200">{p.memory_count}</span> memori
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => setEdit(p)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-300 hover:bg-white/10"
                  title="Edit project (nama/path/tech/deskripsi)"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => setDetail(p)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-300 hover:bg-white/10"
                  title="Detail project (breakdown + pola lintas-project)"
                >
                  <Info className="h-3.5 w-3.5" /> Detail
                </button>
                <button
                  onClick={() => handleSmart(p.id)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-violet-300 hover:bg-violet-500/10"
                  title="AI ekstrak memori pintar dari commit git"
                >
                  {busy[p.id] === "smart" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Smart
                </button>
                <button
                  onClick={() => handleIndex(p.id)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-300 hover:bg-white/10"
                  title="Index commit git jadi memori"
                >
                  {busy[p.id] === "index" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                  Index
                </button>
                <button
                  onClick={() => onOpenMemories({ project_id: p.id })}
                  className="btn btn-ghost !py-1 text-xs text-sky-300 hover:bg-sky-500/10"
                >
                  Lihat memori <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {result[p.id] && (
              <div
                className={cn(
                  "mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
                  result[p.id].success ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                )}
              >
                {result[p.id].success ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {result[p.id].kind === "smart"
                      ? `+${result[p.id].smartAdded} memori pintar (dari ${result[p.id].commits} commit)`
                      : `+${result[p.id].added} commit diindex${result[p.id].smartAdded ? `, smart +${result[p.id].smartAdded}` : ""}${result[p.id].skipped > 0 ? `, ${result[p.id].skipped} duplikat` : ""}`}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    {result[p.id].skipped ? "Bukan repo git / tanpa commit" : result[p.id].error || "Gagal"}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <ProjectDetailModal project={projects.find((p) => p.id === detail?.id) || detail} onClose={() => setDetail(null)} />
      {edit && <EditProjectModal project={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}
