import { useState } from "react";
import { X, Loader2, Plus, Tag } from "lucide-react";
import { api } from "../api.js";
import { ALL_TYPES, typeMeta, cn } from "../lib.jsx";

export default function AddMemoryModal({ open, onClose, projects = [], onSaved }) {
  const [type, setType] = useState("general");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => {
    setType("general");
    setProjectId("");
    setTitle("");
    setContent("");
    setTagsText("");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!content.trim()) {
      setError("Isi memori wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.addMemory({
        type,
        project_id: projectId || null,
        title: title.trim() || undefined,
        content: content.trim(),
        tags,
        source: "dashboard"
      });
      onSaved?.();
      reset();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-inset ring-sky-500/30">
              <Plus className="h-4 w-4 text-sky-300" />
            </div>
            <h3 className="text-sm font-semibold text-white">Tambah Memori</h3>
          </div>
          <button onClick={handleClose} className="btn btn-ghost !p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Type selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Tipe</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TYPES.map((t) => {
                const meta = typeMeta(t);
                const Icon = meta.icon;
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                      active ? cn(meta.bg, meta.ring, meta.color) : "bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
              <option value="">— Unscoped (tanpa project) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Judul <span className="text-slate-600">(opsional)</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul singkat…"
              className="input"
              maxLength={120}
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Isi <span className="text-rose-400">*</span></label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tuliskan isi memori…"
              rows={5}
              className="input resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Tag <span className="text-slate-600">(pisahkan dengan koma)</span></label>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="bug, frontend, urgent"
                className="input !pl-9"
              />
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button onClick={handleClose} className="btn btn-ghost text-sm">Batal</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
