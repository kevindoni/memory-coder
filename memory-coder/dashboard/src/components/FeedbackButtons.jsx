import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { cn } from "../lib.jsx";

export default function FeedbackButtons({ memory }) {
  const [useful, setUseful] = useState(memory.useful_count ?? 0);
  const [notUseful, setNotUseful] = useState(memory.not_useful_count ?? 0);
  const [busy, setBusy] = useState(null);

  const vote = async (val) => {
    if (busy) return;
    setBusy(val);
    const prevU = useful, prevN = notUseful;
    if (val) setUseful((n) => n + 1);
    else setNotUseful((n) => n + 1);
    try {
      await api.feedback(memory.id, val);
    } catch (e) {
      setUseful(prevU);
      setNotUseful(prevN);
    } finally {
      setBusy(null);
    }
  };

  const net = useful - notUseful;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); vote(true); }}
        disabled={busy !== null}
        title="Tandai berguna (naikkan ranking)"
        className={cn("btn btn-ghost !px-2 !py-1 text-xs", useful > 0 ? "text-emerald-300" : "text-slate-400")}
      >
        {busy === true ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
        <span className="font-mono">{useful}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); vote(false); }}
        disabled={busy !== null}
        title="Tandai tidak membantu (turunkan ranking)"
        className={cn("btn btn-ghost !px-2 !py-1 text-xs", notUseful > 0 ? "text-rose-300" : "text-slate-400")}
      >
        {busy === false ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
        <span className="font-mono">{notUseful}</span>
      </button>
      <span className={cn("ml-1 font-mono text-[10px]", net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-slate-600")}>
        {net > 0 ? `+${net}` : net}
      </span>
    </div>
  );
}
