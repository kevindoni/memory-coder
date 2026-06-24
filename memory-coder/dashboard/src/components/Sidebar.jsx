import { LayoutDashboard, FolderKanban, BrainCircuit, Activity, ScrollText, RefreshCw, Sparkles, ClipboardList, GraduationCap, Search, Network, GitCompare, Settings as Cog } from "lucide-react";
import { cn } from "../lib.jsx";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "memories", label: "Memories", icon: BrainCircuit },
  { id: "recall", label: "Recall", icon: Search },
  { id: "graph", label: "Graph", icon: Network },
  { id: "learning", label: "Learning", icon: GraduationCap },
  { id: "conflicts", label: "Conflicts", icon: GitCompare },
  { id: "ask", label: "Ask AI", icon: Sparkles },
  { id: "capture", label: "Capture Chat", icon: ClipboardList },
  { id: "logs", label: "Activity Log", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Cog }
];

export default function Sidebar({ view, onView, health, stats, onRefresh, refreshing }) {
  const online = health?.ok === true;
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.06] bg-slate-950/60">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-inset ring-sky-500/30">
          <BrainCircuit className="h-5 w-5 text-sky-300" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Memory Coder</div>
          <div className="text-[11px] text-slate-500">Monitoring Dashboard</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onView(item.id)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300")} />
              {item.label}
              {item.id === "memories" && stats?.memoryCount != null && (
                <span className="ml-auto rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{stats.memoryCount}</span>
              )}
              {item.id === "projects" && stats?.projectCount != null && (
                <span className="ml-auto rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{stats.projectCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("relative flex h-2 w-2", online ? "text-emerald-400" : "text-rose-400")}>
              <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", online ? "animate-ping bg-emerald-400" : "bg-rose-400")} />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-rose-400")} />
            </span>
            <div className="leading-tight">
              <div className="text-xs font-medium text-slate-300">{online ? "Bridge online" : "Bridge offline"}</div>
              <div className="font-mono text-[10px] text-slate-500">:3333</div>
            </div>
          </div>
          <button onClick={onRefresh} disabled={refreshing} className="btn btn-ghost !p-1.5" title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 px-1 text-[10px] text-slate-600">
          <Activity className="h-3 w-3" />
          <span>Local • PM2 managed</span>
        </div>
      </div>
    </aside>
  );
}
