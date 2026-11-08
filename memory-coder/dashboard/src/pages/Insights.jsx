import { useEffect, useState } from "react";
import { TrendingUp, Loader2, Flame, ThumbsUp, Activity, Eye } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import { TYPE_META, timeAgo, truncate, cn } from "../lib.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function GrowthChart({ buckets }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> Pertumbuhan memori (12 bulan)
      </h3>
      <div className="flex h-40 items-end gap-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="group flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{b.count}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-emerald-500/70 to-emerald-400 transition-all group-hover:from-emerald-600 group-hover:to-emerald-500"
              style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
            />
            <span className="text-[9px] text-slate-500 dark:text-slate-500">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvalTrend({ trend }) {
  if (!trend || trend.length < 2) {
    return (
      <div className="card flex h-full flex-col items-center justify-center gap-2 p-5 text-slate-500 dark:text-slate-600">
        <TrendingUp className="h-6 w-6" />
        <p className="text-xs">Belum ada trend eval (jalankan scripts/eval-recall.cjs).</p>
      </div>
    );
  }
  const W = 560, H = 160, PAD = 28;
  const pts = trend.map((t, i) => ({
    x: PAD + (i / (trend.length - 1)) * (W - PAD * 2),
    hit: t.hitRate ?? 0,
    mrr: t.mrr ?? 0,
    ts: t.ts
  }));
  const y = (v) => H - PAD - v * (H - PAD * 2);
  const line = (key) => pts.map((p) => `${p.x.toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> Kualitas recall (eval trend)
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> hit@5 {(last.hit * 100).toFixed(1)}%</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> MRR {last.mrr.toFixed(3)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" strokeDasharray={g === 0 ? "" : "3 4"} />
            <text x={PAD - 6} y={y(g) + 3} textAnchor="end" className="fill-slate-400 dark:fill-slate-500" fontSize="8">{Math.round(g * 100)}</text>
          </g>
        ))}
        <polyline points={line("mrr")} fill="none" className="stroke-sky-500" strokeWidth="1.5" strokeOpacity="0.7" />
        <polyline points={line("hit")} fill="none" className="stroke-emerald-500" strokeWidth="2" />
        {pts.filter((_, i) => i === pts.length - 1).map((p) => (
          <circle key="last" cx={p.x} cy={y(p.hit)} r="3.5" className="fill-emerald-500" />
        ))}
      </svg>
      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-600">
        {trend.length} titik · terakhir {new Date(last.ts).toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function TopList({ title, icon: Icon, items, accent, metricLabel }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Icon className={cn("h-4 w-4", accent)} /> {title}
      </h3>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-600">Belum ada data.</p>}
        {items.map((m, i) => {
          const meta = TYPE_META[m.type] || TYPE_META.general;
          return (
            <div key={m.id} className="flex items-center gap-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.02] px-3 py-2">
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{i + 1}</span>
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{truncate(m.title, 70)}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-600">{timeAgo(m.created_at)}</p>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                {metricLabel} {m.metric}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [growth, setGrowth] = useState([]);
  const [trend, setTrend] = useState([]);
  const [topAccess, setTopAccess] = useState([]);
  const [topUseful, setTopUseful] = useState([]);
  const [typeSplit, setTypeSplit] = useState([]);

  useEffect(() => {
    Promise.all([
      api.memories({ limit: 10000 }).catch(() => null),
      api.evalTrend().catch(() => ({ trend: [] })),
      api.stats().catch(() => null)
    ]).then(([mems, tr, stats]) => {
      if (!mems) { setError("Gagal memuat memori"); setLoading(false); return; }
      const list = mems.memories || [];
      // pertumbuhan 12 bulan terakhir
      const now = new Date();
      const buckets = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}`, count: 0 });
      }
      const bmap = new Map(buckets.map((b) => [b.key, b]));
      for (const m of list) {
        const d = new Date(m.created_at);
        const b = bmap.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (b) b.count++;
      }
      setGrowth(buckets);
      setTrend((tr && tr.trend) || []);
      setTopAccess(
        [...list]
          .filter((m) => (m.access_count || 0) > 0)
          .sort((a, b) => (b.access_count || 0) - (a.access_count || 0))
          .slice(0, 8)
          .map((m) => ({ ...m, metric: m.access_count }))
      );
      setTopUseful(
        [...list]
          .filter((m) => (m.useful_count || 0) - (m.not_useful_count || 0) > 0)
          .sort((a, b) => (b.useful_count - b.not_useful_count) - (a.useful_count - a.not_useful_count))
          .slice(0, 8)
          .map((m) => ({ ...m, metric: m.useful_count - m.not_useful_count }))
      );
      if (stats?.byType) setTypeSplit(Object.entries(stats.byType));
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Insights</h2>
        <p className="text-sm text-slate-500 dark:text-slate-500">Analitik pertumbuhan, kualitas recall, dan memori paling berpengaruh.</p>
      </div>

      {error && <div className="card p-4 text-sm text-rose-600 dark:text-rose-300">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 py-12 text-slate-500 dark:text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Menghitung insight…
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <GrowthChart buckets={growth} />
            <EvalTrend trend={trend} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <TopList title="Paling sering di-recall" icon={Eye} items={topAccess} accent="text-emerald-600 dark:text-emerald-300" metricLabel="akses" />
            <TopList title="Paling berguna (feedback)" icon={ThumbsUp} items={topUseful} accent="text-sky-600 dark:text-sky-300" metricLabel="net" />
          </div>
          {typeSplit.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Flame className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> Komposisi tipe
              </h3>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {typeSplit.map(([name, count]) => {
                  const meta = TYPE_META[name] || TYPE_META.general;
                  return <div key={name} className={meta.dot} title={`${meta.label}: ${count}`} style={{ width: `${(count / typeSplit.reduce((s, [, c]) => s + c, 0)) * 100}%` }} />;
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {typeSplit.map(([name, count]) => {
                  const meta = TYPE_META[name] || TYPE_META.general;
                  return (
                    <span key={name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
