import { useEffect, useState } from "react";
import { Settings as Cog, Cpu, RefreshCw, Loader2, Database, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import { ALL_TYPES, typeMeta, cn, timeAgo } from "../lib.jsx";

export default function Settings({ stats }) {
  const [embed, setEmbed] = useState(null);
  const [reembedding, setReembedding] = useState(false);
  const [reembedResult, setReembedResult] = useState(null);
  const [sample, setSample] = useState([]);
  const [stale, setStale] = useState([]);

  useEffect(() => {
    api.embedStatus().then(setEmbed).catch(() => {});
    api.memories({ limit: 300 }).then((r) => {
      const mems = r.memories || [];
      setSample(mems);
      setStale(
        [...mems]
          .filter((m) => !m.superseded_by)
          .map((m) => ({ m, ageDays: (Date.now() - new Date(m.created_at).getTime()) / 86400000, signal: (m.useful_count || 0) + (m.access_count || 0) * 0.1 }))
          .filter((x) => x.ageDays > 30 && x.signal < 1)
          .sort((a, b) => a.signal - b.signal)
          .slice(0, 8)
      );
    }).catch(() => {});
  }, []);

  const doReembed = async () => {
    if (!confirm("Re-embed SEMUA memori dengan model aktif? Butuh ~1-3 menit. Lanjut?")) return;
    setReembedding(true);
    setReembedResult(null);
    try {
      const r = await api.reembed(0);
      setReembedResult(r);
    } catch (e) {
      setReembedResult({ success: false, error: e.message });
    } finally {
      setReembedding(false);
    }
  };

  const byType = {};
  ALL_TYPES.forEach((t) => (byType[t] = sample.filter((m) => m.type === t).length));
  const withFeedback = sample.filter((m) => (m.useful_count || 0) + (m.not_useful_count || 0) > 0).length;
  const superseded = sample.filter((m) => m.superseded_by).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <p className="text-sm text-slate-500">Status engine, re-embed, dan kesehatan data memori.</p>
      </div>

      {/* Embedding engine */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Cpu className="h-4 w-4 text-sky-300" /> Embedding engine</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Model aktif" value={embed?.model || "…"} mono />
          <Field label="Dimensi" value={embed ? `${embed.dim}-d` : "…"} mono />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {embed?.model?.includes("multilingual")
            ? "✓ Multilingual aktif ( recall Indonesia sudah optimal)."
            : "⚠ Model monolingual — ganti ke Xenova/paraphrase-multilingual-MiniLM-L12-v2 (env EMBEDDING_MODEL) lalu re-embed untuk akurasi Indonesia."}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={doReembed} disabled={reembedding} className="btn btn-primary !py-1.5 text-xs">
            {reembedding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-embed semua
          </button>
          {reembedResult && (
            <span className={cn("inline-flex items-center gap-1 text-xs", reembedResult.success ? "text-emerald-300" : "text-rose-300")}>
              {reembedResult.success ? <><CheckCircle2 className="h-3.5 w-3.5" /> {reembedResult.reembedded} memori di-reembed</> : <><AlertTriangle className="h-3.5 w-3.5" /> {reembedResult.error}</>}
            </span>
          )}
        </div>
      </div>

      {/* Scheduler info */}
      <div className="card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Clock className="h-4 w-4 text-amber-300" /> Scheduler (PM2: memory-coder-scheduler)</h3>
        <p className="text-xs text-slate-500">
          Eval harian jam 03:00 lokal (metric parafrasa) · Consolidate mingguan (Minggu 04:00, dry-run). Atur via <span className="font-mono">ecosystem.config.cjs</span> (env <span className="font-mono">SCHED_*</span>).
        </p>
      </div>

      {/* Data health */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Database className="h-4 w-4 text-violet-300" /> Kesehatan data</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total" value={stats?.memoryCount ?? "…"} />
          <Stat label="Unscoped" value={stats?.unscoped ?? "…"} tone={stats?.unscoped > 1000 ? "warn" : ""} />
          <Stat label="Dgn feedback" value={`${withFeedback}/${sample.length}`} />
          <Stat label="Tersupersede" value={superseded} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALL_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
              <span className={cn("h-1.5 w-1.5 rounded-full", typeMeta(t).dot)} /> {typeMeta(t).label} {byType[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Stale candidates (decay) */}
      <div className="card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle className="h-4 w-4 text-rose-300" /> Kandidat stale (tua &gt;30h, minim sinyal)</h3>
        {stale.length === 0 ? (
          <p className="py-2 text-xs text-slate-600">Tidak ada kandidat stale pada sampel.</p>
        ) : (
          <div className="space-y-1.5">
            {stale.map(({ m, ageDays, signal }) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", typeMeta(m.type).dot)} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{m.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">{Math.round(ageDays)}h · sinyal {signal.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-600">Kandidat ini tidak otomatis dihapus — review manual di tab Memories bila perlu.</p>
      </div>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div>
      <div className={cn("text-sm text-slate-200", mono && "font-mono text-xs break-all")}>{value}</div>
    </div>
  );
}
function Stat({ label, value, tone }) {
  return (
    <div className={cn("rounded-lg bg-white/[0.02] px-3 py-2", tone === "warn" && "ring-1 ring-amber-500/20")}>
      <div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div>
      <div className={cn("font-mono text-lg font-semibold", tone === "warn" ? "text-amber-300" : "text-slate-100")}>{value}</div>
    </div>
  );
}
