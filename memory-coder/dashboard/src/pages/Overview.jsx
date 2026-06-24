import { useEffect, useState } from "react";
import { FolderKanban, BrainCircuit, Bug, Lightbulb, Inbox, ArrowUpRight } from "lucide-react";
import { api } from "../api.js";
import StatCard from "../components/StatCard.jsx";
import TypeBadge from "../components/TypeBadge.jsx";
import { TYPE_META, timeAgo, truncate, cn } from "../lib.jsx";

function Distribution({ title, items, total, onSelect }) {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0) || 1;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="font-mono text-xs text-slate-500">{total} total</span>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-600">Belum ada data.</p>}
        {items.map((item) => {
          const meta = TYPE_META[item.name] || TYPE_META.general;
          const pct = Math.round((item.count / max) * 100);
          return (
            <button
              key={item.name}
              onClick={() => onSelect?.(item.name)}
              className="group block w-full text-left"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 capitalize text-slate-300">
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {item.label || item.name}
                </span>
                <span className="font-mono text-slate-400">{item.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={cn("h-full rounded-full transition-all", meta.dot)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Overview({ stats, onOpenMemories }) {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.memories({ limit: 6 }).then((r) => setRecent(r.memories || [])).catch(() => {});
  }, [stats]);

  const typeItems = Object.entries(stats?.byType || {}).map(([name, count]) => ({ name, label: TYPE_META[name]?.label || name, count }));
  const projectItems = (stats?.byProject || []).map((p) => ({ name: p.id, label: p.name, count: p.count }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label="Projects" value={stats?.projectCount ?? "—"} accent="sky" />
        <StatCard icon={BrainCircuit} label="Total Memories" value={stats?.memoryCount ?? "—"} accent="violet" />
        <StatCard icon={Bug} label="Bugs" value={stats?.byType?.bug ?? 0} accent="rose" />
        <StatCard icon={Lightbulb} label="Decisions" value={stats?.byType?.decision ?? 0} accent="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Distribution title="Distribusi per Tipe" items={typeItems} total={stats?.memoryCount ?? 0} onSelect={(name) => onOpenMemories({ type: name })} />
        <Distribution title="Distribusi per Project" items={projectItems} total={stats?.projectCount ?? 0} onSelect={(id) => onOpenMemories({ project_id: id })} />
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Aktivitas Terbaru</h3>
          <button onClick={() => onOpenMemories({})} className="btn btn-ghost !py-1 text-xs">
            Lihat semua <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {recent.length === 0 && (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Inbox className="h-4 w-4" /> Belum ada memori tersimpan.
            </div>
          )}
          {recent.map((m) => (
            <div key={m.id} className="flex items-start gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2.5">
              <div className="mt-0.5 w-16 shrink-0">
                <TypeBadge type={m.type} size="xs" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">{m.title}</p>
                <p className="truncate text-xs text-slate-500">{truncate(m.content, 90)}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-slate-600">{timeAgo(m.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
