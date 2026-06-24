# Trae Integration Guide

Trae yang mendukung MCP bisa langsung pakai server `memory-coder`.
Kalau mode MCP belum stabil, gunakan HTTP bridge sebagai fallback.

## Option A - MCP
Pakai config MCP yang mengarah ke:
```json
{
  "mcpServers": {
    "memory-coder": {
      "command": "node",
      "args": ["D:\\laragon\\www\\MCPCODING\\memory-coder\\dist\\index.js"],
      "cwd": "D:\\laragon\\www\\MCPCODING\\memory-coder"
    }
  }
}
```

## Option B - Bridge
Jalankan:
```bash
npm run start:bridge
```

Lalu gunakan endpoint:
- `POST /v1/get-project-context`
- `POST /v1/recall`
- `POST /v1/remember`
- `POST /v1/log-bug`

## Suggested usage pattern
- Mulai sesi dengan context retrieval.
- Gunakan `recall` sebelum debugging.
- Simpan hasil fix ke `log-bug`.
