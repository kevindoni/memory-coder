import { useEffect, useState } from "react";
import { GitCompare, Loader2, Check, Trash2, Layers, AlertTriangle } from "lucide-react";
import { api } from "../api.js";
import TypeBadge from "../components/TypeBadge.jsx";
import { cn } from "../lib.jsx";

export default function Conflicts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState(new Set());
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api.conflicts(500).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const remove = async (keepId, dropId, pairKey) => {
    if (!confirm("Hapus memori yang kalah? (ada backup di activity log)")) return;
    setBusy(pairKey);
    try {
      await api.deleteMemory(dropId);
      setResolved((s) => new Set(s).add(pairKey));
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setBusy("");
    }
  };

  const Pair = ({ pair, kind }) => {
    const key = `${pair.a.id}__${pair.b.id}`;
    if (resolved.has(key)) return null;
    return (
      <div className="card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px]", kind === "dup" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300")}>
            {kind === "dup" ? "DUPLIKAT" : "KONFLIK"} sim={pair.sim}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[pair.a, pair.b].map((side, i) => (
            <div key={side.id} className="rounded-md bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-slate-600">{i === 0 ? "A" : "B"}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{side.title}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button onClick={() => remove(pair.a.id, pair.b.id, key)} disabled={busy === key} className="btn btn-ghost !py-1 text-xs text-emerald-300 hover:bg-emerald-500/10">
            {busy === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Simpan A
          </button>
          <button onClick={() => remove(pair.b.id, pair.a.id, key)} disabled={busy === key} className="btn btn-ghost !py-1 text-xs text-emerald-300 hover:bg-emerald-500/10">
            <Check className="h-3 w-3" /> Simpan B
          </button>
          <button onClick={() => setResolved((s) => new Set(s).add(key))} className="btn btn-ghost !py-1 text-xs text-slate-400">
            Lewati
          </button>
        </div>
      </div>
    );
  };

  const dups = (data?.duplicates || []).filter((p) => !resolved.has(`${p.a.id}__${p.b.id}`));
  const confs = (data?.conflicts || []).filter((p) => !resolved.has(`${p.a.id}__${p.b.id}`));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Conflicts</h2>
          <p className="text-sm text-slate-500">Antre resolve duplikat & decision konflik (Jaccard token, sampel {data?.scanned ?? "…"} memori).</p>
        </div>
        <button onClick={load} className="btn btn-ghost !py-1.5 text-xs"><GitCompare className="h-3.5 w-3.5" /> Scan ulang</button>
      </div>

      {error && <div className="card p-4 text-sm text-rose-300">Gagal: {error}</div>}
      {loading && <div className="flex items-center gap-2 py-8 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memindai…</div>}

      {data && (
        <>
          {dups.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-rose-300"><Layers className="h-4 w-4" /> Duplikat nyata ({dups.length})</h3>
              {dups.slice(0, 50).map((p, i) => <Pair key={`d${i}`} pair={p} kind="dup" />)}
            </div>
          )}
          {confs.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-amber-300"><AlertTriangle className="h-4 w-4" /> Decision mungkin konflik ({confs.length})</h3>
              {confs.slice(0, 50).map((p, i) => <Pair key={`c${i}`} pair={p} kind="conf" />)}
            </div>
          )}
          {dups.length === 0 && confs.length === 0 && !loading && (
            <div className="card flex flex-col items-center gap-2 py-16 text-slate-600">
              <Check className="h-8 w-8 text-emerald-400" />
              <p className="text-sm">Bersih — tidak ada duplikat/konflik pada sampel.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
