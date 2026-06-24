# Copilot Integration Guide

GitHub Copilot biasanya tidak memanggil MCP server lokal secara langsung di semua setup, jadi pola paling aman adalah memakai HTTP bridge.

## Recommended flow
1. Start bridge:
   ```bash
   npm run start:bridge
   ```
2. Use the agent prompt in `integrations/agent_prompt.md`.
3. Call bridge endpoints from your own helper script, VS Code task, or manual curl.

## Suggested workflow
- Saat mulai kerja, panggil `GET /health`.
- Saat buka project, panggil `POST /v1/get-project-context`.
- Saat menemukan keputusan penting, panggil `POST /v1/remember`.
- Saat memperbaiki bug, panggil `POST /v1/log-bug`.
- Saat butuh konteks lama, panggil `POST /v1/recall`.

## Example helper command
```bash
node integrations/bridge_client.js recall "{\"query\":\"cors issue\",\"project_name\":\"my-app\"}"
```

## Practical note
Kalau kamu memakai Copilot Chat, cara paling efektif biasanya:
- simpan prompt bridge sebagai snippet
- jalankan helper CLI untuk recall sebelum minta Copilot menulis patch
- paste hasil recall ke konteks chat
