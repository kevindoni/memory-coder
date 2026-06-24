# Kilo Integration Guide

Kilo yang sudah support MCP bisa langsung ke server `memory-coder`.
Kalau kamu ingin alur yang lebih universal, pakai bridge + helper CLI.

## MCP config
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

## Bridge fallback
```bash
npm run start:bridge
```

### Helper examples
```bash
node integrations/bridge_client.js recall "{\"query\":\"auth token expired\",\"project_name\":\"my-app\"}"
node integrations/bridge_client.js remember "{\"content\":\"Prefer named exports in utility modules\",\"type\":\"decision\",\"project_name\":\"my-app\"}"
```

## Practical tip
Gunakan `get-project-context` di awal sesi, lalu `recall` saat debugging, dan `remember/log-bug` setelah selesai.
