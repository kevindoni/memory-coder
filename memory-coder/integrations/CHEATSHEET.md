# Memory Coder Cheatsheet

Satu halaman ringkas untuk semua cara pakai `memory-coder`.

## 1) Start Services

### MCP mode
```bash
npm run start
```

### Bridge mode
```bash
npm run start:bridge
```

### CLI mode
```bash
npm run start:cli -- help
```

## 2) MCP Config

### Claude Desktop / Kilo / Trae
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

## 3) Bridge URLs

Base URL:
```text
http://127.0.0.1:3333/v1
```

Health check:
```bash
curl http://127.0.0.1:3333/health
```

## 4) Core Commands

### Create project
```bash
node dist/cli.js create-project --json "{\"name\":\"my-app\",\"path\":\"D:/projects/my-app\",\"tech_stack\":[\"typescript\",\"express\"],\"description\":\"API project\"}"
```

### Get project context
```bash
node dist/cli.js get-project-context --json "{\"project_name\":\"my-app\"}"
```

### Remember
```bash
node dist/cli.js remember --json "{\"content\":\"We prefer async/await over then chains\",\"type\":\"decision\",\"project_name\":\"my-app\"}"
```

### Recall
```bash
node dist/cli.js recall --json "{\"query\":\"cors issue in express\",\"project_name\":\"my-app\",\"limit\":5}"
```

### Log bug
```bash
node dist/cli.js log-bug --json "{\"error\":\"Cannot read property map of undefined\",\"context\":\"user list render\",\"solution\":\"Default to empty array before map\",\"project_name\":\"my-app\"}"
```

## 5) Bridge API Examples

### Create project
```bash
curl -X POST http://127.0.0.1:3333/v1/create-project ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"my-app\",\"path\":\"D:/projects/my-app\",\"tech_stack\":[\"typescript\",\"express\"],\"description\":\"API project\"}"
```

### Recall
```bash
curl -X POST http://127.0.0.1:3333/v1/recall ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"cors issue in express\",\"project_name\":\"my-app\",\"limit\":5}"
```

## 6) Agent Prompt

Use this file for non-MCP agents:
- `integrations/agent_prompt.md`

## 7) Recommended Workflow

1. Start `bridge` or `MCP`.
2. Call `get-project-context`.
3. Call `recall` before debugging.
4. Call `remember` for lasting decisions.
5. Call `log-bug` after fixes.

## 8) Integration Shortcuts

- Copilot: `integrations/copilot/README.md`
- Trae: `integrations/trae/README.md`
- Kilo: `integrations/kilo/README.md`
