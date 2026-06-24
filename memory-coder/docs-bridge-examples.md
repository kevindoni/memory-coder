# Memory Coder Bridge Examples

Base URL:
`http://127.0.0.1:3333`

## Health
```bash
curl http://127.0.0.1:3333/health
```

## Create Project
```bash
curl -X POST http://127.0.0.1:3333/v1/create-project ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"my-app\",\"path\":\"D:/projects/my-app\",\"tech_stack\":[\"typescript\",\"express\"],\"description\":\"API project\"}"
```

## Remember
```bash
curl -X POST http://127.0.0.1:3333/v1/remember ^
  -H "Content-Type: application/json" ^
  -d "{\"content\":\"We prefer async/await over then chains\",\"type\":\"preference\",\"project_name\":\"my-app\"}"
```

## Recall
```bash
curl -X POST http://127.0.0.1:3333/v1/recall ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"cors problem in express\",\"project_name\":\"my-app\",\"limit\":5}"
```

## Log Bug
```bash
curl -X POST http://127.0.0.1:3333/v1/log-bug ^
  -H "Content-Type: application/json" ^
  -d "{\"error\":\"Cannot read property map of undefined\",\"context\":\"user list render\",\"solution\":\"Default to empty array before map\",\"project_name\":\"my-app\"}"
```

## JSON Payload Shapes

### create-project
```json
{
  "name": "string",
  "path": "string",
  "tech_stack": ["string"],
  "description": "string"
}
```

### remember
```json
{
  "content": "string",
  "type": "bug|decision|pattern|learning|general",
  "project_id": "string",
  "project_name": "string",
  "title": "string",
  "tags": ["string"],
  "metadata": {}
}
```

### recall
```json
{
  "query": "string",
  "project_id": "string",
  "project_name": "string",
  "type": "bug|decision|pattern|learning|general",
  "limit": 5
}
```

### log-bug
```json
{
  "error": "string",
  "context": "string",
  "solution": "string",
  "project_id": "string",
  "project_name": "string"
}
```
