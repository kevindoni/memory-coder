import { cn } from "../lib.jsx";

export default function StatCard({ icon: Icon, label, value, sub, accent = "sky" }) {
  const accents = {
    sky: "text-sky-300 bg-sky-500/10 ring-sky-500/20",
    violet: "text-violet-300 bg-violet-500/10 ring-violet-500/20",
    amber: "text-amber-300 bg-amber-500/10 ring-amber-500/20",
    emerald: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/20",
    rose: "text-rose-300 bg-rose-500/10 ring-rose-500/20"
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset", accents[accent])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold text-white tabular-nums">{value}</span>
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}
