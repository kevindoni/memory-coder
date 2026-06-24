# Memory Coder

**Production-grade persistent memory layer for AI coding assistants.**

MCP server + HTTP bridge + CLI untuk memori coding yang persisten. Tujuannya: AI tidak amnesia antar sesi, dan bisa mengingat proyek, keputusan, bug, dan preferensi kerja.

## ✨ Optimized (10/10)

- **Hybrid Search**: Semantic (ANN) + BM25 keyword fusion → 30-40% better relevance
- **Re-ranking**: Multi-signal scoring (similarity, keyword, importance, recency, access)
- **Fast Retrieval**: 12-17x faster vector search via bucketed ANN index
- **Scalable DB**: Batched writes (25x fewer I/O), auto-hydration, robust dedup
- **Production-Ready**: API key auth, rate limiting, request logging, LLM retry+timeout

[See detailed optimization results](OPTIMIZATION_SUMMARY.md)

## Ringkas

- **MCP mode**: `npm run start`
- **Bridge mode**: `MEMORY_CODER_MODE=bridge npm run start:bridge`
- **CLI mode**: `npm run start:cli -- help`
- **Bridge base**: `http://127.0.0.1:3333/v1`
- **Health check**: `http://127.0.0.1:3333/health`

## Integrasi Cepat

### MCP config

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

### Bridge examples

- `integrations/CHEATSHEET.md`
- `docs-bridge-examples.md`
- `integrations/agent_prompt.md`
- `integrations/copilot/README.md`
- `integrations/trae/README.md`
- `integrations/kilo/README.md`

## Core Tools

1. **`create_project`** — daftar proyek baru
2. **`get_project_context`** — ambil konteks proyek
3. **`remember`** — simpan keputusan, pola, dan pelajaran
4. **`recall`** — cari memori secara **hybrid (semantic + keyword)** dengan **re-ranking**
5. **`log_bug`** — simpan bug dan solusinya

## Cara Pakai

### 1) Mulai proyek baru

```text
Bantu saya setup project API dengan Express + TypeScript di D:\api-project
```

Hasil: AI memanggil `create_project`.

### 2) Lanjut kerja di proyek lama

```text
Lanjutkan kerja di proyek API
```

Hasil: AI memanggil `get_project_context`.

### 3) Cari bug lama (HYBRID + RERANKING)

```text
Pernah kita ada masalah dengan CORS di express?
```

Hasil: AI memanggil `recall` dengan hybrid search + re-ranking → paling relevan muncul duluan.

```bash
# Manual test: hybrid recall with reranking
curl -X POST http://localhost:3333/v1/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cors error express middleware",
    "project_name": "my-app",
    "limit": 5,
    "hybrid": true,
    "reranking": true
  }'
```

### 4) Catat hasil fix

```text
Error: Cannot read property 'map' of undefined di routes/user.js line 45
Context: Saat fetch users dari database, result undefined
Solution: Tambah check if (!users) return []
```

Hasil: AI memanggil `log_bug`.

### 5) Catat keputusan

```text
Ingat bahwa kita memutuskan pakai JWT bukan session untuk auth karena perlu scalable
```

Hasil: AI memanggil `remember`.

## Struktur Memori

- **`bug`** — error, context, solution
- **`decision`** — keputusan arsitektur dan alasannya
- **`pattern`** — pola kode yang berguna
- **`learning`** — hal baru yang dipelajari
- **`general`** — informasi umum lain

## Recall API Parameters (Hybrid + Re-ranking)

### `/v1/recall` — Advanced Search

```json
{
  "query": "cors error express middleware",
  "project_name": "my-app",
  "limit": 5,
  "candidate_pool": 40,    // candidate memories to retrieve (default: 40)
  "hybrid": true,            // enable BM25 keyword + semantic fusion (default: true)
  "reranking": true,         // enable multi-signal re-ranking (default: true)
  "type": "bug"              // optional: filter by memory type
}
```

**Response fields:**
- `mode`: "hybrid" or "semantic"
- `reranked`: true/false
- `results`: array of memories with `similarity` AND `rerank_score`

## Bridge + CLI

### Start bridge

```bash
MEMORY_CODER_MODE=bridge MEMORY_CODER_PORT=3333 npm run start:bridge
```

### Start CLI

```bash
npm run start:cli -- help
```

### Contoh CLI

```bash
node dist/cli.js recall --json "{\"query\":\"cors issue in express\",\"project_name\":\"my-app\",\"limit\":5}"
node dist/cli.js remember --json "{\"content\":\"We prefer async/await over then chains\",\"type\":\"decision\",\"project_name\":\"my-app\"}"
```

## File Penting

- `src/index.ts` — entrypoint MCP
- `src/bridge/http.ts` — HTTP bridge
- `src/cli.ts` — CLI wrapper
- `src/core/memory-service.ts` — logic utama yang dipakai MCP dan bridge

## Catatan

- Database tersimpan lokal di `data/memory.db`
- Embedding berjalan lokal dengan `@xenova/transformers`
- Hybrid search: semantic (ANN vector search) + BM25 keyword → 30-40% better relevance
- Re-ranking: multi-signal (similarity, keyword overlap, importance, recency, access frequency)
- Batched DB writes: debounced 500ms, auto-flush after 25 writes → 25x fewer I/O
- API key auth: set `MEMORY_CODER_API_KEY` to protect `/v1/admin/*` endpoints
- Rate limiting: 20 req/min (AI endpoints), 120 req/min (write endpoints)
- See [OPTIMIZATION_SUMMARY.md](OPTIMIZATION_SUMMARY.md) for detailed performance metrics

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

Key variables:
- `MEMORY_CODER_MODE=bridge` — run as HTTP server
- `MEMORY_CODER_PORT=3333` — server port
- `MEMORY_CODER_API_KEY=secret` — admin endpoint authentication
- `MEMORY_CODER_AI_RATE=20` — rate limit for AI endpoints
- `INDEXER_INTERVAL_MIN=360` — auto-index interval (git commits)
- Jika bridge dipakai, gunakan `project_name` agar memori terscope ke proyek yang benar
