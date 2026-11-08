import { Plugin } from "@opencode/plugin"

/**
 * memory-coder autopilot — closes the capture/inject loop at the
 * infrastructure level (claude-mem pattern), LLM-free:
 *
 *  - inject: on every user prompt admission, recall relevant memories from
 *    the memory-coder bridge (project auto-detected from the session
 *    directory) and expose them as a session instruction entry, so the
 *    agent sees relevant context without calling any tool.
 *  - capture: once per session, when it goes idle, store a mechanical
 *    digest (first prompt = intent, last assistant text = outcome) as a
 *    low-importance general memory tagged session-digest.
 *
 * Everything fails silently when the bridge is down; the plugin must never
 * break a session.
 */

const BRIDGE = process.env.MEMORY_CODER_BRIDGE_URL || "http://127.0.0.1:3333"
const RECALL_MIN_CHARS = 16
const RECALL_LIMIT = 6
const MIN_SIM = Number(process.env.MEMORY_AUTOPILOT_MIN_SIM || 0.45)
const STRONG_SIM = Number(process.env.MEMORY_AUTOPILOT_STRONG_SIM || 0.6)
const SNIPPET_CHARS = Number(process.env.MEMORY_AUTOPILOT_SNIPPET || 160)
const INJECT_MAX_CHARS = 1200
const DIGEST_KEY = "memory-coder-autopilot"

const bridge = {
  async recall(query: string, cwd?: string) {
    const res = await fetch(`${BRIDGE}/v1/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, cwd, limit: RECALL_LIMIT }),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return (await res.json()) as { results?: Array<{ title?: string; content?: string; similarity?: number; type?: string }> }
  },
  async remember(content: string, title: string, cwd?: string, tags: string[] = []) {
    const res = await fetch(`${BRIDGE}/v1/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, title, type: "general", cwd, tags, metadata: { source: "autopilot" } }),
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  },
}

export default Plugin.define({
  id: "memory-coder-autopilot",
  setup(ctx) {
    // ---- auto-inject: recall on prompt admission ----
    void ctx.session.hook("prompt", async (event) => {
      try {
        const text = (event.prompt?.text || "").trim()
        if (text.length < RECALL_MIN_CHARS) return
        const sid = (event as { sessionID?: string }).sessionID
        let cwd: string | undefined
        try {
          const s = await ctx.session.get({ sessionID: sid! })
          cwd = (s as { directory?: string }).directory || ctx.location.directory
        } catch {
          cwd = ctx.location.directory
        }
        const r = await bridge.recall(text, cwd)
        // token-saving gate: only inject genuinely relevant memories.
        // Tiered: strong hits (>=STRONG_SIM) inject up to 4; a single
        // moderate hit (>=MIN_SIM) injects at most 2; below MIN_SIM skip
        // entirely — mediocre context costs tokens and adds noise.
        const strong = (r?.results || []).filter((h) => h && h.content && (h.similarity ?? 0) >= STRONG_SIM)
        const moderate = (r?.results || []).filter((h) => h && h.content && (h.similarity ?? 0) >= MIN_SIM)
        const hits = strong.length > 0 ? strong.slice(0, 4) : moderate.slice(0, 2)
        if (!sid || hits.length === 0) return
        const lines = hits.map(
          (h) => `- [${h.type || "memory"}${h.similarity != null ? ` ${h.similarity}` : ""}] ${(h.title || "").slice(0, 80)}: ${(h.content || "").replace(/\s+/g, " ").slice(0, SNIPPET_CHARS)}`,
        )
        const value = `Memori relevan dari memory-coder (auto-recall, jangan kutip mentah — gunakan sebagai konteks):\n${lines.join("\n")}`.slice(0, INJECT_MAX_CHARS)
        await ctx.session.instructions.entry.put({ sessionID: sid, key: "memory-context", value })
      } catch {
        // bridge down / schema drift — never break the prompt
      }
    })

    // ---- auto-capture: mechanical session digest on idle ----
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ types: ["session.idle"], signal: controller.signal })) {
          try {
            const sid = (event as { properties?: { sessionID?: string; directory?: string } }).properties?.sessionID
            const dir = (event as { properties?: { directory?: string } }).properties?.directory
            if (!sid) continue
            const flag = `digested:${sid}`
            if (await ctx.storage.get(flag)) continue
            await ctx.storage.set(flag, true)
            const messages = await ctx.session.context({ sessionID: sid })
            const firstUser = messages.find((m) => (m as { role?: string }).role === "user")
            const lastAssistant = [...messages].reverse().find((m) => (m as { role?: string }).role === "assistant")
            const intent = String((firstUser as { parts?: Array<{ text?: string }> } | undefined)?.parts?.find((p) => p.text)?.text || "").replace(/\s+/g, " ").slice(0, 300)
            const outcome = String((lastAssistant as { parts?: Array<{ text?: string }> } | undefined)?.parts?.find((p) => p.text)?.text || "").replace(/\s+/g, " ").slice(0, 500)
            if (!intent && !outcome) continue
            const title = `Digest sesi: ${intent.slice(0, 70) || "(tanpa intent)"}`
            const content = [intent && `Intent: ${intent}`, outcome && `Outcome: ${outcome}`].filter(Boolean).join("\n\n")
            await bridge.remember(content, title, dir, ["session-digest", "autopilot"])
          } catch {
            // per-event failure is non-fatal
          }
        }
      } catch {
        // stream aborted (unload)
      }
    })()

    return () => controller.abort()
  },
})
