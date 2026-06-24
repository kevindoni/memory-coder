import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Sidebar from "./components/Sidebar.jsx";
import AddMemoryModal from "./components/AddMemoryModal.jsx";
import Overview from "./pages/Overview.jsx";
import Projects from "./pages/Projects.jsx";
import Memories from "./pages/Memories.jsx";
import Logs from "./pages/Logs.jsx";
import Ask from "./pages/Ask.jsx";
import Capture from "./pages/Capture.jsx";
import Learning from "./pages/Learning.jsx";
import Recall from "./pages/Recall.jsx";
import Graph from "./pages/Graph.jsx";
import Conflicts from "./pages/Conflicts.jsx";
import Settings from "./pages/Settings.jsx";
import { LayoutDashboard, FolderKanban, BrainCircuit, ScrollText, Plus, Sparkles, ClipboardList, GraduationCap, Search, Network, GitCompare, Settings as Cog } from "lucide-react";

const TITLES = {
  overview: { label: "Overview", icon: LayoutDashboard },
  projects: { label: "Projects", icon: FolderKanban },
  memories: { label: "Memories", icon: BrainCircuit },
  recall: { label: "Recall", icon: Search },
  graph: { label: "Graph", icon: Network },
  learning: { label: "Learning", icon: GraduationCap },
  conflicts: { label: "Conflicts", icon: GitCompare },
  ask: { label: "Ask AI", icon: Sparkles },
  capture: { label: "Capture Chat", icon: ClipboardList },
  logs: { label: "Activity Log", icon: ScrollText },
  settings: { label: "Settings", icon: Cog }
};

export default function App() {
  const [view, setView] = useState("overview");
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [memSeed, setMemSeed] = useState({ filter: {}, key: 0 });
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([api.health().catch(() => ({ ok: false })), api.stats().catch(() => null), api.projects().catch(() => ({ projects: [] }))])
      .then(([h, s, p]) => {
        setHealth(h);
        if (s) setStats(s);
        setProjects(p?.projects || []);
      })
      .finally(() => setTimeout(() => setRefreshing(false), 300));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => api.health().catch(() => ({ ok: false })).then((h) => setHealth(h)), 15000);
    return () => clearInterval(id);
  }, [load]);

  const refresh = useCallback(() => {
    load();
    setRefreshSignal((n) => n + 1);
  }, [load]);

  const openMemories = (filter) => {
    setMemSeed({ filter, key: Date.now() });
    setView("memories");
  };

  const handleView = (v) => {
    if (v === "memories") setMemSeed((s) => ({ filter: {}, key: Date.now() }));
    setView(v);
  };

  const TitleIcon = TITLES[view].icon;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar view={view} onView={handleView} health={health} stats={stats} onRefresh={refresh} refreshing={refreshing} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-8 py-4">
          <div className="flex items-center gap-2.5">
            <TitleIcon className="h-5 w-5 text-sky-300" />
            <h1 className="text-base font-semibold text-white">{TITLES[view].label}</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="font-mono">POST</span> /v1/admin/*
            </span>
            <span className="font-mono text-slate-600">v1.0.0</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary !py-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah Memori
          </button>
        </header>
        {view === "ask" ? (
          <div className="flex flex-1 flex-col overflow-hidden px-8 pb-6 pt-1">
            <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
              <Ask projects={projects} signal={refreshSignal} />
            </div>
          </div>
        ) : (
          <div className="scrollbar-thin flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-6xl">
              {view === "overview" && <Overview stats={stats} onOpenMemories={openMemories} />}
              {view === "projects" && <Projects signal={refreshSignal} onOpenMemories={openMemories} onNeedsRefresh={refresh} />}
              {view === "memories" && (
                <Memories key={memSeed.key} initialFilter={memSeed.filter} projects={projects} signal={refreshSignal} onNeedsRefresh={refresh} />
              )}
              {view === "learning" && <Learning projects={projects} />}
              {view === "recall" && <Recall projects={projects} />}
              {view === "graph" && <Graph projects={projects} />}
              {view === "conflicts" && <Conflicts />}
              {view === "settings" && <Settings stats={stats} />}
              {view === "capture" && <Capture projects={projects} onNeedsRefresh={refresh} />}
              {view === "logs" && <Logs projects={projects} signal={refreshSignal} />}
            </div>
          </div>
        )}
      </main>
      <AddMemoryModal open={showAddModal} onClose={() => setShowAddModal(false)} projects={projects} onSaved={refresh} />
    </div>
  );
}
