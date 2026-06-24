# Memory Coder Quick Note

## Start
- MCP: `npm run start`
- Bridge: `npm run start:bridge`
- CLI: `npm run start:cli -- help`

## MCP Config
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

## Bridge Base
- `http://127.0.0.1:3333/v1`
- Health: `http://127.0.0.1:3333/health`

## Core Actions
- Create project
- Get context
- Recall memory
- Remember decision
- Log bug

## Best Flow
1. `get-project-context`
2. `recall`
3. Work
4. `remember` / `log-bug`
