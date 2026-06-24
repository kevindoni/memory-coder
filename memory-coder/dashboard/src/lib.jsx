import {
  Bug,
  Lightbulb,
  Boxes,
  Sparkles,
  FileText,
  CircleDot,
  PlusCircle,
  Trash2,
  FolderPlus,
  FolderMinus,
  GitBranch,
  RefreshCw,
  Globe,
  Bot,
  MonitorSmartphone
} from "lucide-react";

export const TYPE_META = {
  bug: { label: "Bug", icon: Bug, color: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/20", dot: "bg-rose-400" },
  decision: { label: "Decision", icon: Lightbulb, color: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/20", dot: "bg-amber-400" },
  pattern: { label: "Pattern", icon: Boxes, color: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-500/20", dot: "bg-sky-400" },
  learning: { label: "Learning", icon: Sparkles, color: "text-violet-300", bg: "bg-violet-500/10", ring: "ring-violet-500/20", dot: "bg-violet-400" },
  general: { label: "General", icon: FileText, color: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", dot: "bg-emerald-400" }
};

export const ALL_TYPES = ["bug", "decision", "pattern", "learning", "general"];

export function typeMeta(type) {
  return TYPE_META[type] || { label: type || "Unknown", icon: CircleDot, color: "text-slate-300", bg: "bg-white/5", ring: "ring-white/10", dot: "bg-slate-400" };
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}d lalu`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}h lalu`;
  return formatDate(iso);
}

export function truncate(str, n = 160) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n).trimEnd() + "…" : str;
}

export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export const LOG_ACTION_META = {
  memory_created: { label: "Memori dibuat", icon: PlusCircle, color: "text-emerald-300", dot: "bg-emerald-400" },
  memory_deleted: { label: "Memori dihapus", icon: Trash2, color: "text-rose-300", dot: "bg-rose-400" },
  bug_logged: { label: "Bug dicatat", icon: Bug, color: "text-rose-300", dot: "bg-rose-400" },
  project_created: { label: "Project dibuat", icon: FolderPlus, color: "text-sky-300", dot: "bg-sky-400" },
  project_deleted: { label: "Project dihapus", icon: FolderMinus, color: "text-rose-300", dot: "bg-rose-400" },
  git_indexed: { label: "Index Git", icon: GitBranch, color: "text-violet-300", dot: "bg-violet-400" },
  index_run: { label: "Auto-index", icon: RefreshCw, color: "text-amber-300", dot: "bg-amber-400" },
  ai_ask: { label: "Ask AI", icon: Sparkles, color: "text-sky-300", dot: "bg-sky-400" },
  ai_summarized: { label: "Smart Summary", icon: Sparkles, color: "text-violet-300", dot: "bg-violet-400" },
  conversation_captured: { label: "Capture Chat", icon: FileText, color: "text-emerald-300", dot: "bg-emerald-400" }
};

export const ALL_LOG_ACTIONS = Object.keys(LOG_ACTION_META);

export function logActionMeta(action) {
  return LOG_ACTION_META[action] || { label: action || "Unknown", icon: CircleDot, color: "text-slate-300", dot: "bg-slate-400" };
}

export const SOURCE_META = {
  agent: { label: "Agent", icon: Bot },
  dashboard: { label: "Dashboard", icon: MonitorSmartphone },
  indexer: { label: "Indexer", icon: RefreshCw },
  bridge: { label: "Bridge", icon: Globe }
};

export function sourceMeta(source) {
  return SOURCE_META[source] || { label: source || "—", icon: Globe };
}
