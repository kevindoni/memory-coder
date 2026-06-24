import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, ChevronLeft, ChevronRight, Loader2, Inbox, X, Filter } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import DeleteButton from "../components/DeleteButton.jsx";
import FeedbackButtons from "../components/FeedbackButtons.jsx";
import RelatedPanel from "../components/RelatedPanel.jsx";
import { ALL_TYPES, formatDate, timeAgo, typeMeta, cn } from "../lib.jsx";

const PAGE_SIZE = 12;

export default function Memories({ initialFilter = {}, projects = [], signal = 0, onNeedsRefresh }) {
  const [projectsList, setProjectsList] = useState(projects);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [page, setPage] = useState(0);

  // User input state (seeded once from initialFilter on mount)
  const [projectSel, setProjectSel] = useState(initialFilter.project_id ?? "");
  const [typeSel, setTypeSel] = useState(initialFilter.type ?? "");
  const [searchText, setSearchText] = useState(initialFilter.search ?? "");

  // Applied filter (debounced)
  const [applied, setApplied] = useState({ project_id: projectSel, type: typeSel, search: searchText });
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!projects || projects.length === 0) {
      api.projects().then((r) => setProjectsList(r.projects || [])).catch(() => {});
    } else {
      setProjectsList(projects);
    }
  }, [projects]);

  // Debounce any filter change -> applied
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setApplied({ project_id: projectSel, type: typeSel, search: searchText });
      setPage(0);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [projectSel, typeSel, searchText]);

  const fetchData = () => {
    setLoading(true);
    setError("");
    const offset = page * PAGE_SIZE;
    api
      .memories({
        project_id: applied.project_id || undefined,
        type: applied.type || undefined,
        search: applied.search || undefined,
        limit: PAGE_SIZE,
        offset
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
  const memories = data?.memories || [];

  const projectName = useMemo(() => {
    const map = {};
    projectsList.forEach((p) => (map[p.id] = p.name));
    return map;
  }, [projectsList]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDelete = async (id) => {
    await api.deleteMemory(id);
    onNeedsRefresh?.();
    fetchData();
  };

  const resetFilters = () => {
    setProjectSel("");
    setTypeSel("");
    setSearchText("");
  };

  const hasActiveFilter = projectSel || typeSel || searchText;
  const activeProjectName = applied.project_id === "null" ? "Unscoped" : projectName[applied.project_id];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Memories</h2>
        <p className="text-sm text-slate-500">
          {total} memori{activeProjectName ? ` · ${activeProjectName}` : ""}{applied.type ? ` · ${typeMeta(applied.type).label}` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Cari judul, isi, atau tag…" className="input !pl-9" />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost !p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select value={projectSel} onChange={(e) => setProjectSel(e.target.value)} className="input !w-auto min-w-[160px]">
          <option value="">Semua project</option>
          <option value="null">— Unscoped —</option>
          {projectsList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={typeSel} onChange={(e) => setTypeSel(e.target.value)} className="input !w-auto min-w-[130px]">
          <option value="">Semua tipe</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{typeMeta(t).label}</option>
          ))}
        </select>
        {hasActiveFilter && (
          <button onClick={resetFilters} className="btn btn-ghost text-xs text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {/* List */}
      {error ? (
        <div className="card p-6 text-sm text-rose-300">Gagal memuat: {error}</div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      ) : memories.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-slate-600">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">Tidak ada memori cocok dengan filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => {
            const isOpen = expanded.has(m.id);
            const meta = typeMeta(m.type);
            return (
              <div key={m.id} className={cn("card overflow-hidden transition-colors", isOpen && "border-white/10")}>
                <div onClick={() => toggle(m.id)} className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={m.type} size="xs" />
                      {m.superseded_by && (
                        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300" title={`Ditinakhtuilirkan oleh ${m.superseded_by}`}>
                          ↳ superseded
                        </span>
                      )}
                      {m.project_id && (
                        <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          {projectName[m.project_id] || "scoped"}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-slate-600">{timeAgo(m.created_at)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-slate-100">{m.title}</p>
                    <p className={cn("mt-0.5 whitespace-pre-wrap text-xs text-slate-500", !isOpen && "line-clamp-1")}>{m.content}</p>
                    {isOpen && m.tags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.tags.map((t) => (
                          <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform", isOpen && "rotate-180")} />
                </div>
                {isOpen && (
                  <>
                    <RelatedPanel memory={m} projectName={projectName} />
                    <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4 py-2">
                      <FeedbackButtons memory={m} />
                      <span className="font-mono text-[10px] text-slate-600">Dibuat {formatDate(m.created_at)}</span>
                      <DeleteButton onConfirm={() => handleDelete(m.id)} title="Hapus memori" />
                    </div>
                  </>
                )}
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
