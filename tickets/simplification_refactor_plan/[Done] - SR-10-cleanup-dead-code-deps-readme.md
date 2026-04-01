# [Done] - SR-10: Cleanup — Dead Code, Dependencies, Config, README

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P3 — Cleanup                              |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-05, SR-09                              |
| **Blocks**    | —                                         |
| **Lane**      | Lane 5 (Cleanup — final)                  |

---

## Description

Final cleanup pass after all refactoring tickets are complete. Remove dead code files, clean up package dependencies (remove `voyageai`), update environment variable templates, and update the README to reflect the simplified architecture.

Also verify the full pipeline works end-to-end: upload → ingest → chat.

---

## Acceptance Criteria

- [x] `voyageai` removed from `package.json`
- [x] `apps/agent/src/adapters/voyage-embedding.adapter.ts` deleted
- [x] `apps/agent/src/adapters/postgres.adapter.ts` deleted (if unused after refactor)
- [x] `apps/agent/src/tools/embed-and-store.tool.ts` deleted
- [x] `apps/agent/src/tools/chunk-text.tool.ts` deleted
- [x] All deleted sub-agent configs verified gone (SR-08 should have handled this)
- [x] All deleted tool files verified gone (SR-05, SR-07 should have handled this)
- [x] No `grep` hits for `VoyageEmbeddingAdapter`, `hybridSearch`, `embedAndStore`, `chunkType`, `parentChunkIndex` in `apps/agent/src/`
- [x] `.env.example` updated: remove `VOYAGE_API_KEY`, per-agent model vars; add `ANTHROPIC_MODEL`
- [x] `CITATION_CONFIDENCE_THRESHOLD`, `CITATION_MAX_RETRIES` env vars removed
- [x] `README.md` architecture section updated to reflect simplified pipeline
- [x] `pnpm exec nx build agent` compiles
- [x] `pnpm exec nx lint agent` passes
- [x] `pnpm install` succeeds after `voyageai` removal

---

## Files to Delete

| File | Reason |
|------|--------|
| `apps/agent/src/adapters/voyage-embedding.adapter.ts` | Voyage integration removed |
| `apps/agent/src/tools/embed-and-store.tool.ts` | Legacy embedding tool |
| `apps/agent/src/tools/chunk-text.tool.ts` | Legacy chunking tool (replaced by enhanced chunker in consumer) |

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Remove `voyageai` dependency |
| `.env.example` (if exists) | Update env vars |
| `README.md` | Update architecture diagrams and descriptions |
| `libs/core/src/types/file.types.ts` | Final check — no orphaned types |
| `libs/core/src/index.ts` | Final check — clean exports |

---

## Implementation Notes

### Dependency Removal

```bash
pnpm remove voyageai
```

### Environment Variables — Final State

```env
# LLM
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_HAIKU_MODEL=claude-haiku-4-5-20251001

# Weaviate
WEAVIATE_HOST=localhost
WEAVIATE_HTTP_PORT=8080
WEAVIATE_GRPC_PORT=50051

# Kafka / Redpanda
KAFKA_BROKERS=localhost:9092

# gRPC
BACKEND_GRPC_URL=localhost:5050

# Search tuning
MAX_SEARCH_CHUNK_CHARS=1200
MAX_FILE_CONTENT_CHARS=20000
```

Removed:
- `VOYAGE_API_KEY`
- `ANTHROPIC_SUPERVISOR_MODEL`
- `ANTHROPIC_SEARCH_MODEL`
- `ANTHROPIC_INGESTION_MODEL`
- `ANTHROPIC_ANALYSIS_MODEL`
- `ANTHROPIC_SUMMARY_MODEL`
- `ANTHROPIC_CITATION_MODEL`
- `CITATION_CONFIDENCE_THRESHOLD`
- `CITATION_MAX_RETRIES`

### README Update Points

1. Architecture diagram: remove Voyage, show single agent, show BM25 search path
2. Ingestion flow: extract → chunk (heuristic) → store (no vectors)
3. Chat flow: single agent with `searchFiles` + `readFile`
4. Environment variables section: simplified list
5. **Migration note**: existing Weaviate data must be wiped — run `resetFileChunksCollection` or delete the Weaviate volume

### Verification Checklist

```bash
# No dead references
rg "VoyageEmbeddingAdapter" apps/agent/src/
rg "hybridSearch" apps/agent/src/
rg "embedAndStore" apps/agent/src/
rg "chunkType" apps/agent/src/
rg "parentChunkIndex" apps/agent/src/
rg "summarizeDocument" apps/agent/src/
rg "compareFiles" apps/agent/src/
rg "evaluateCitationConfidence" apps/agent/src/
rg "supervisorConfig" apps/agent/src/
rg "VOYAGE_API_KEY" .

# All should return zero results
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `pnpm install` succeeds | No missing dependencies |
| 2 | `pnpm exec nx build agent` compiles | Zero errors |
| 3 | `pnpm exec nx lint agent` passes | Zero lint errors |
| 4 | No grep hits for dead code patterns | Verification checklist passes |
| 5 | Upload TXT file → ingestion completes | `file.ready` event received, zero LLM calls |
| 6 | Upload PDF file → ingestion completes | `file.ready` event, one Haiku call |
| 7 | Chat query with file selected → response with citations | Single agent responds using tools |
| 8 | Chat query without file → cross-file search → response | BM25 search returns results |
| 9 | README accurately describes current architecture | Manual review |
