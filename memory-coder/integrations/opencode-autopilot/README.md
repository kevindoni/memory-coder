# memory-coder autopilot (OpenCode plugin)

Menutup loop capture→inject di level infrastruktur (pola claude-mem), tanpa LLM.

## Pasang

```powershell
New-Item -ItemType Directory -Force ~/.config/opencode/plugins/memory-autopilot
Copy-Item index.ts ~/.config/opencode/plugins/memory-autopilot/
```

Tambahkan ke `~/.config/opencode/opencode.jsonc`:

```jsonc
{ "plugins": ["./plugins/memory-autopilot"] }
```

## Perilaku

**Auto-inject** — setiap prompt user (≥16 karakter): plugin me-recall memori
relevan dari bridge (proyek terdeteksi otomatis dari direktori sesi) dan
menyuntikkannya sebagai instruction entry `memory-context` (maks ~1.4 KB).
Agent melihat konteks relevan tanpa memanggil tool apa pun.

**Auto-capture** — sekali per sesi, saat `session.idle`: digest mekanis
(prompt pertama = intent, teks asisten terakhir = outcome) disimpan sebagai
memori `general` ber-tag `session-digest` + `autopilot`, importance rendah.

Semua kegagalan (bridge mati, schema berubah) ditelan diam-diam — plugin
tidak boleh mematahkan sesi. Env opsional: `MEMORY_CODER_BRIDGE_URL`.
