import { useEffect, useState } from "react";
import { FolderKanban, MapPin, Hash, ChevronRight, Loader2, GitBranch, CheckCircle2, AlertCircle, Info, Pencil, BookOpen, Download, Copy, X, RefreshCw } from "lucide-react";
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
  const [skillModal, setSkillModal] = useState(null);
  const [skillFormat, setSkillFormat] = useState("skill");
  const [skillProjectId, setSkillProjectId] = useState(null);
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

  const handleSkill = async (id) => {
    setBusy((s) => ({ ...s, [id]: "skill" }));
    setSkillProjectId(id);
    try {
      const r = await api.exportSkill(id, skillFormat);
      setSkillModal(r);
    } catch (e) {
      alert("Gagal export skill: " + e.message);
    } finally {
      setBusy((s) => ({ ...s, [id]: null }));
    }
  };

  if (error) return <div className="card p-6 text-sm text-rose-600 dark:text-rose-300">Gagal memuat: {error}</div>;
  if (projects === null)
    return (
      <div className="flex items-center gap-2 py-12 text-slate-500 dark:text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat projects…
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Projects</h2>
          <p className="text-sm text-slate-500 dark:text-slate-500">{projects.length} project terdaftar di memori</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="card group flex flex-col p-5 transition-colors hover:border-slate-200 hover:dark:border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
                  <FolderKanban className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500">{timeAgo(p.last_active)}</span>
                </div>
              </div>
              <DeleteButton title="Hapus project + memori" onConfirm={() => handleDelete(p.id, p.name)} />
            </div>

            <p className="mt-3 line-clamp-2 text-xs text-slate-500 dark:text-slate-500">{p.description || "Tanpa deskripsi"}</p>

            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-600">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{p.path}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {p.tech_stack?.slice(0, 4).map((t) => (
                <span key={t} className="rounded-md bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{t}</span>
              ))}
              {p.tech_stack?.length > 4 && (
                <span className="rounded-md bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-500">+{p.tech_stack.length - 4}</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 dark:border-white/[0.06] pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Hash className="h-3.5 w-3.5" />
                <span className="font-mono text-base font-semibold text-slate-700 dark:text-slate-200">{p.memory_count}</span> memori
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => setEdit(p)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:dark:bg-white/10"
                  title="Edit project (nama/path/tech/deskripsi)"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => setDetail(p)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:dark:bg-white/10"
                  title="Detail project (breakdown + pola lintas-project)"
                >
                  <Info className="h-3.5 w-3.5" /> Detail
                </button>
                <button
                  onClick={() => handleIndex(p.id)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:dark:bg-white/10"
                  title="Index commit git jadi memori"
                >
                  {busy[p.id] === "index" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                  Index
                </button>
                <button
                  onClick={() => handleSkill(p.id)}
                  disabled={!!busy[p.id]}
                  className="btn btn-ghost !py-1 text-xs text-violet-600 dark:text-violet-300 hover:bg-violet-500/10"
                  title="Export SKILL.md - pengetahuan proyek siap dimuat agent (OpenCode/Claude/Cursor)"
                >
                  {busy[p.id] === "skill" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  Skill
                </button>
                <button
                  onClick={() => onOpenMemories({ project_id: p.id })}
                  className="btn btn-ghost !py-1 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10"
                >
                  Lihat memori <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {result[p.id] && (
              <div
                className={cn(
                  "mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
                  result[p.id].success ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-600 dark:text-amber-300"
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
      {skillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSkillModal(null)}>
          <div className="card max-h-[85vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Export Agent Skill</h3>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {[
                    { v: "skill", label: "SKILL.md", hint: "skills dir (OpenCode/Claude/Cursor)" },
                    { v: "agents", label: "AGENTS.md", hint: "root proyek / .agents/" }
                  ].map((f) => (
                    <button
                      key={f.v}
                      onClick={() => setSkillFormat(f.v)}
                      title={f.hint}
                      className={cn(
                        "rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors",
                        skillFormat === f.v
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                          : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    onClick={() => skillProjectId && handleSkill(skillProjectId)}
                    className="btn btn-ghost !py-0.5 !px-1.5 text-[10px] text-slate-500 dark:text-slate-400"
                    title="Muat ulang dengan format terpilih"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                  {skillModal.filename} · {skillModal.stats.total} memori → {skillModal.stats.decisions + skillModal.stats.bugs + skillModal.stats.patterns + skillModal.stats.learnings} entri terkurasi + protokol sesi
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([skillModal.content], { type: "text/markdown" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = skillModal.filename;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="btn btn-primary !py-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Unduh
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(skillModal.content)}
                  className="btn btn-ghost !py-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button onClick={() => setSkillModal(null)} className="btn btn-ghost !p-1.5"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="scrollbar-thin max-h-[70vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap p-5 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{skillModal.content}</pre>
            </div>
            <div className="border-t border-slate-200 dark:border-white/[0.06] px-5 py-3 text-[11px] text-slate-500 dark:text-slate-500">
              Taruh di <span className="font-mono">~/.config/opencode/skills/&lt;nama&gt;/SKILL.md</span> (OpenCode), <span className="font-mono">.agents/skills/</span> (Claude/Cursor), lalu restart agent.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
