import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, ClipboardPaste, AlertTriangle, CheckCircle2, Trash2, FileText, Tag, FolderSearch, UploadCloud, Zap } from "lucide-react";
import { api } from "../api.js";
import { typeMeta, cn } from "../lib.jsx";

export default function Capture({ projects = [], onNeedsRefresh }) {
  const [conversation, setConversation] = useState("");
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [watcher, setWatcher] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.fileWatcher().then(setWatcher).catch(() => {});
    const t = setInterval(() => api.fileWatcher().then(setWatcher).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const extract = async () => {
    if (!conversation.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await api.capture({
        conversation: conversation.trim(),
        project_id: projectId || undefined,
        source: "dashboard"
      });
      if (r.success) {
        setResult(r);
        onNeedsRefresh?.();
      } else {
        setError(r.error || "Gagal");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setConversation(text);
    } catch {
      setError("Tidak bisa akses clipboard. Paste manual.");
    }
  };

  const clear = () => {
    setConversation("");
    setResult(null);
    setError("");
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const text = await file.text();
      if (!text.trim() || text.length < 20) {
        setError("File terlalu pendek atau kosong");
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      const r = await api.captureFile({
        content: text,
        filename: file.name.replace(/\.[^.]+$/, ""),
        project_name: project?.name,
      });
      if (r.success) {
        setResult({ success: true, extracted: -1, fileUploaded: true, file: r.file });
        onNeedsRefresh?.();
        setTimeout(() => api.fileWatcher().then(setWatcher).catch(() => {}), 2000);
      } else {
        setError(r.error || "Gagal upload");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const projectName = projectId ? projects.find((p) => p.id === projectId)?.name : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Capture Conversation</h2>
        <p className="text-sm text-slate-500">
          Drop file atau tempel percakapan — AI ekstrak memori otomatis.
        </p>
      </div>

      {/* File watcher status */}
      {watcher && (
        <div className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
          watcher.active && watcher.llmConfigured
            ? "bg-emerald-500/10 text-emerald-300"
            : "bg-amber-500/10 text-amber-300"
        )}>
          <FolderSearch className="h-3.5 w-3.5 shrink-0" />
          {watcher.active && watcher.llmConfigured ? (
            <span>
              Auto file watcher <strong>active</strong> — drop <code className="rounded bg-white/10 px-1">.txt</code>/<code className="rounded bg-white/10 px-1">.md</code> ke{" "}
              <code className="rounded bg-white/10 px-1">{watcher.watchDir}</code>
              {" · "}
              <Zap className="inline h-3 w-3" /> {watcher.processed} processed
              {watcher.pending > 0 && ` · ${watcher.pending} pending`}
            </span>
          ) : (
            <span>File watcher {watcher.llmConfigured ? "tidak aktif" : "LLM belum dikonfigurasi"}</span>
          )}
        </div>
      )}

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed py-6 text-center transition-colors",
          dragOver ? "border-sky-400 bg-sky-500/5" : "border-slate-700 hover:border-slate-600"
        )}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        ) : (
          <UploadCloud className={cn("h-6 w-6", dragOver ? "text-sky-400" : "text-slate-500")} />
        )}
        <p className="text-sm text-slate-400">
          {uploading ? "Uploading..." : dragOver ? "Drop file di sini" : "Drag & drop file .txt / .md atau klik untuk browse"}
        </p>
        <p className="text-[11px] text-slate-600">
          File auto-diproses oleh file watcher → AI ekstrak memori
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input !w-auto min-w-[160px]">
          <option value="">Tanpa project (unscoped)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={paste} className="btn btn-ghost text-xs text-slate-400">
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste dari clipboard
        </button>
        {conversation && (
          <button onClick={clear} className="btn btn-ghost text-xs text-slate-400">
            <Trash2 className="h-3.5 w-3.5" /> Bersihkan
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-600">{conversation.length} karakter</span>
      </div>

      {/* Textarea */}
      <div className="card p-0">
        <textarea
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
          placeholder={"Atau tempel percakapan secara manual di sini…\n\nContoh:\nUser: Bagaimana cara setup auth?\nAssistant: Kita pakai NextAuth + bcryptjs…"}
          rows={8}
          className="w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0"
        />
      </div>

      {error && (
        <div className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* Extract button */}
      <div className="flex justify-center">
        <button
          onClick={extract}
          disabled={!conversation.trim() || loading}
          className="btn btn-primary !px-6 text-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "AI menganalisis…" : "Ekstrak Memori"}
        </button>
      </div>

      {/* Results */}
      {result && result.success && (
        <div className="space-y-3">
          {result.fileUploaded ? (
            <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-300">
              <CheckCircle2 className="h-4 w-4" />
              File <code className="rounded bg-white/10 px-1">{result.file}</code> di-upload — file watcher akan memproses otomatis. Lihat Activity Log untuk hasil.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                {result.extracted > 0
                  ? `${result.extracted} memori berhasil diekstrak${result.project ? ` untuk ${result.project}` : ""}`
                  : "Tidak ada memori yang bisa diekstrak dari percakapan ini."}
              </div>

              {result.memories?.length > 0 && (
                <div className="space-y-2">
                  {result.memories.map((m, i) => {
                    const meta = typeMeta(m.type);
                    const Icon = meta.icon;
                    return (
                      <div key={m.id || i} className="card p-4">
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium", meta.bg, meta.ring, meta.color)}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </span>
                          <h4 className="text-sm font-medium text-white">{m.title}</h4>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{m.content}</p>
                        {m.tags?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {m.tags.map((t) => (
                              <span key={t} className="inline-flex items-center gap-0.5 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                <Tag className="h-2.5 w-2.5" /> {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
