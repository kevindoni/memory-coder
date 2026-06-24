import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { api } from "../api.js";

export default function EditProjectModal({ project, onClose, onSaved }) {
  const [name, setName] = useState(project.name || "");
  const [path, setPath] = useState(project.path || "");
  const [tech, setTech] = useState((project.tech_stack || []).join(", "));
  const [description, setDescription] = useState(project.description || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    const body = {
      name: name.trim(),
      path: path.trim(),
      tech_stack: tech.split(",").map((t) => t.trim()).filter(Boolean),
      description: description.trim()
    };
    try {
      await api.updateProject(project.id, body);
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit Project</h3>
          <button onClick={onClose} className="btn btn-ghost !p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Path</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} className="input mt-1 font-mono text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Tech stack (pisah koma)</label>
            <input value={tech} onChange={(e) => setTech(e.target.value)} className="input mt-1 font-mono text-xs" placeholder="React, Node.js, …" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Deskripsi</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input mt-1 text-xs" />
          </div>
          {err && <div className="text-xs text-rose-300">{err}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost !py-2 text-xs">Batal</button>
          <button onClick={save} disabled={saving} className="btn btn-primary !py-2 text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
