import { useEffect, useState } from "react";
import { Cpu, Loader2, RefreshCw, Play, Trash2, FolderSearch, CopyCheck, GitMerge, SlidersHorizontal, Clock, FolderSymlink } from "lucide-react";
import { api } from "../api.js";
import { cn } from "../lib.jsx";

function StatCard({ icon: Icon, label, value, accent = "sky" }) {
  const accents = {
    sky: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10",
    emerald: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10",
    amber: "text-amber-600 dark:text-amber-300 bg-amber-500/10",
    rose: "text-rose-600 dark:text-rose-300 bg-rose-500/10",
    violet: "text-violet-600 dark:text-violet-300 bg-violet-500/10"
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accents[accent])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-slate-500 dark:text-slate-500">{label}</div>
        <div className="text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, on }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-white/[0.02] px-3 py-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={cn("rounded px-2 py-0.5 font-mono text-[11px]", on ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-slate-500/10 text-slate-500 dark:text-slate-400")}>
        {value}
      </span>
    </div>
  );
}

export default function SmartManager() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api.smartStatus().then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const runExpire = async (apply) => {
    setBusy(apply ? "apply" : "dry");
    try {
      const r = await api.smartExpire(apply);
      setToast(`${apply ? "Dihapus" : "Dry-run"}: ${r.expired?.length ?? 0} memori stale (${r.reason})`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const runScope = async (apply) => {
    setBusy(apply ? "scope-apply" : "scope-dry");
    try {
      const r = await api.smartScope(apply);
      setToast(`${apply ? "Di-scope" : "Dry-run"}: ${r.scoped ?? 0}/${r.scanned ?? 0} memori unscoped dipetakan ke project`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const cfg = data?.config || {};
  const c = data?.counters || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Cpu className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /> Smart Manager
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-500">Auto-detect project, dedup real-time, conflict auto-resolve, importance tuning, expire stale.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost !py-1.5 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>

      {error && <div className="card p-4 text-sm text-rose-600 dark:text-rose-300">Gagal: {error}</div>}
      {toast && <div className="card border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">{toast}</div>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon={FolderSearch} label="Project auto-detected" value={c.autoDetectedProjects ?? 0} accent="emerald" />
            <StatCard icon={CopyCheck} label="Dedup dilewati" value={c.dedupSkipped ?? 0} accent="sky" />
            <StatCard icon={GitMerge} label="Conflict auto-resolved" value={c.conflictsResolved ?? 0} accent="violet" />
            <StatCard icon={SlidersHorizontal} label="Importance di-tune" value={c.importanceTuned ?? 0} accent="amber" />
            <StatCard icon={Trash2} label="Stale expired" value={c.staleExpired ?? 0} accent="rose" />
            <StatCard icon={Clock} label="Last tick" value={c.lastTick ? new Date(c.lastTick).toLocaleTimeString() : "—"} accent="sky" />
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">Konfigurasi aktif</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <ConfigRow label="Auto-detect project" value={String(cfg.autoDetect)} on={cfg.autoDetect} />
              <ConfigRow label="Dedup threshold" value={cfg.dedupThreshold} on={cfg.dedupThreshold > 0} />
              <ConfigRow label="Expire age (hari)" value={cfg.expireDays} on={cfg.expireDays > 0} />
              <ConfigRow label="Expire max access" value={cfg.expireMinAccess} on={true} />
              <ConfigRow label="Expire dry-run" value={String(cfg.expireDryRun)} on={!cfg.expireDryRun} />
              <ConfigRow label="Conflict auto-resolve" value={String(cfg.autoResolveConflicts)} on={cfg.autoResolveConflicts} />
            </div>
          </div>

          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Auto-expire stale memories</h3>
              <p className="text-xs text-slate-500 dark:text-slate-500">Hapus memori lama, jarang diakses, importance rendah, tanpa feedback positif.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => runExpire(false)} disabled={busy} className="btn btn-ghost !py-1.5 text-xs">
                {busy === "dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Dry-run
              </button>
              <button onClick={() => runExpire(true)} disabled={busy} className="btn btn-primary !py-1.5 text-xs">
                {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus sekarang
              </button>
            </div>
          </div>

          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300"><FolderSymlink className="h-4 w-4 text-violet-600 dark:text-violet-300" /> Auto-scope unscoped memories</h3>
              <p className="text-xs text-slate-500 dark:text-slate-500">Petakan memori tanpa project ke project terdaftar berdasarkan nama/path di konten.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => runScope(false)} disabled={busy} className="btn btn-ghost !py-1.5 text-xs">
                {busy === "scope-dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Dry-run
              </button>
              <button onClick={() => runScope(true)} disabled={busy} className="btn btn-primary !py-1.5 text-xs">
                {busy === "scope-apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSymlink className="h-3.5 w-3.5" />} Scope sekarang
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
