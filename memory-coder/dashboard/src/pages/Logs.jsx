import { useEffect, useRef, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Inbox, X, Filter, Clock } from "lucide-react";
import { api } from "../api.js";
import { ALL_LOG_ACTIONS, formatDate, logActionMeta, sourceMeta, cn } from "../lib.jsx";

const PAGE_SIZE = 25;

export default function Logs({ projects = [], signal = 0 }) {
  const [projectsList, setProjectsList] = useState(projects);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const [actionSel, setActionSel] = useState("");
  const [sourceSel, setSourceSel] = useState("");
  const [projectSel, setProjectSel] = useState("");
  const [searchText, setSearchText] = useState("");

  const [applied, setApplied] = useState({ action: "", source: "", project_id: "", search: "" });
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!projects || projects.length === 0) {
      api.projects().then((r) => setProjectsList(r.projects || [])).catch(() => {});
    } else {
      setProjectsList(projects);
    }
  }, [projects]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setApplied({ action: actionSel, source: sourceSel, project_id: projectSel, search: searchText });
      setPage(0);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [actionSel, sourceSel, projectSel, searchText]);

  const fetchData = () => {
    setLoading(true);
    setError("");
    api
      .logs({
        action: applied.action || undefined,
        source: applied.source || undefined,
        project_id: applied.project_id || undefined,
        search: applied.search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
      .then((r) => {
        setData(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page, signal]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const logs = data?.logs || [];

  const projectName = (id) => {
    if (!id) return null;
    const p = projectsList.find((x) => x.id === id);
    return p ? p.name : null;
  };

  const resetFilters = () => {
    setActionSel("");
    setSourceSel("");
    setProjectSel("");
    setSearchText("");
  };

  const hasActiveFilter = actionSel || sourceSel || projectSel || searchText;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Activity Log</h2>
        <p className="text-sm text-slate-500">{total} aktivitas tercatat di sistem</p>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Cari aktivitas…" className="input !pl-9" />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost !p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select value={actionSel} onChange={(e) => setActionSel(e.target.value)} className="input !w-auto min-w-[150px]">
          <option value="">Semua aksi</option>
          {ALL_LOG_ACTIONS.map((a) => (
            <option key={a} value={a}>{logActionMeta(a).label}</option>
          ))}
        </select>
        <select value={sourceSel} onChange={(e) => setSourceSel(e.target.value)} className="input !w-auto min-w-[130px]">
          <option value="">Semua sumber</option>
          <option value="agent">Agent</option>
          <option value="dashboard">Dashboard</option>
          <option value="indexer">Indexer</option>
          <option value="bridge">Bridge</option>
        </select>
        <select value={projectSel} onChange={(e) => setProjectSel(e.target.value)} className="input !w-auto min-w-[150px]">
          <option value="">Semua project</option>
          {projectsList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {hasActiveFilter && (
          <button onClick={resetFilters} className="btn btn-ghost text-xs text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Timeline */}
      {error ? (
        <div className="card p-6 text-sm text-rose-300">Gagal memuat: {error}</div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat log…
        </div>
      ) : logs.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-slate-600">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">Belum ada aktivitas tercatat.</p>
        </div>
      ) : (
        <div className="relative space-y-1 pl-4">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />
          {logs.map((log) => {
            const meta = logActionMeta(log.action);
            const src = sourceMeta(log.source);
            const Icon = meta.icon;
            const SrcIcon = src.icon;
            const proj = projectName(log.project_id);
            return (
              <div key={log.id} className="relative flex items-start gap-3 py-2.5">
                <span className={cn("relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ring-4 ring-slate-950", meta.dot)} />
                <div className="card min-w-0 flex-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium", "bg-white/5", meta.color)}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      <SrcIcon className="h-3 w-3" />
                      {src.label}
                    </span>
                    {proj && (
                      <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">{proj}</span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-slate-600">
                      <Clock className="h-3 w-3" />
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-200">{log.summary}</p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {Object.entries(log.metadata).slice(0, 6).map(([k, v]) => (
                        <span key={k} className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Halaman {page + 1} dari {totalPages} · {total} total
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-ghost !py-1.5">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-ghost !py-1.5">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
