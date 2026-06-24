import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, AlertTriangle, Bot, User, FileText, Trash2, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import { cn } from "../lib.jsx";

export default function Ask({ projects = [], signal = 0 }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    api.llmStatus().then((r) => setStatus(r)).catch(() => {});
  }, [signal]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    setLoading(true);

    const userMsg = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const history = messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const r = await api.ask({
        question: q,
        project_id: projectId || undefined,
        history
      });
      if (r.success) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: r.answer, sources: r.sources, model: r.model }
        ]);
      } else {
        setError(r.error || "Gagal");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError("");
  };

  const configured = status?.configured;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input !w-auto !py-1.5 text-xs">
          <option value="">Semua project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {configured ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
            <Sparkles className="h-3 w-3" />
            {status?.model}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            OpenRouter belum dikonfigurasi
          </span>
        )}
        {messages.length > 0 && (
          <button onClick={clearChat} className="btn btn-ghost !py-1.5 text-xs text-slate-400">
            <Trash2 className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Messages / empty state */}
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 ring-1 ring-inset ring-sky-500/20">
              <Bot className="h-7 w-7 text-sky-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Ask AI — Tanya ke Memori</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Tanya apa saja tentang project kamu. AI cari memori relevan lalu menjawab dengan referensi sumber.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {["Tech stack apa yang dipakai?", "Bug apa yang pernah di-fix?", "Keputusan arsitektur terpenting?"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/10 hover:text-slate-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))
        )}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-inset ring-sky-500/20">
              <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
            </div>
            <div className="card px-4 py-3 text-xs text-slate-500">AI sedang mencari memori & menyusun jawaban…</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] pt-3">
        {error && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Tulis pertanyaan… (Enter untuk kirim, Shift+Enter baris baru)"
              rows={1}
              className="input resize-none !py-2.5"
              style={{ minHeight: "44px", maxHeight: "140px" }}
            />
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="btn btn-primary !h-[44px] !px-4"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
          isUser ? "bg-slate-500/10 ring-slate-500/20" : "bg-sky-500/10 ring-sky-500/20"
        )}
      >
        {isUser ? <User className="h-4 w-4 text-slate-300" /> : <Bot className="h-4 w-4 text-sky-300" />}
      </div>
      <div className={cn("max-w-[80%]", isUser && "flex flex-col items-end")}>
        <div className={cn("card px-4 py-3 text-sm", isUser ? "bg-white/[0.06] text-slate-100" : "text-slate-200")}>
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {msg.sources.slice(0, 5).map((s, i) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500"
                title={`${s.title} (${Math.round(s.similarity * 100)}%)`}
              >
                <FileText className="h-2.5 w-2.5" />
                [{i + 1}] {s.title.length > 24 ? s.title.slice(0, 24) + "…" : s.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
