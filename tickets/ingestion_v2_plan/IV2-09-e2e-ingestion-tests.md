# IV2-09: E2E Integration Tests — Full Ingestion Pipeline

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 5                              |
| **Priority**  | P1 — Validates entire pipeline  |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01 through IV2-08 (all)    |
| **Blocks**    | —                              |

---

## Description

Create end-to-end integration tests that exercise the complete file ingestion pipeline across both services (backend + agent) with real Kafka (Redpanda), Postgres, and mocked external APIs (Haiku, VoyageAI, Weaviate). These tests verify the full event flow from HTTP upload through to final status update and SSE delivery.

---

## Acceptance Criteria

- [ ] PDF upload completes full pipeline: upload → PROCESSING → EXTRACTING → EXTRACTED → EMBEDDING → READY
- [ ] TXT upload completes full pipeline with `extractionMethod: 'raw'`
- [ ] MD upload completes full pipeline with `extractionMethod: 'raw'`
- [ ] JSON upload completes full pipeline with `extractionMethod: 'raw'`
- [ ] DOCX upload returns 400
- [ ] Video upload returns 400
- [ ] Corrupt PDF triggers `file.failed` with `stage: 'extraction'`, final status FAILED
- [ ] Empty file triggers `file.failed`
- [ ] `parsedText` is persisted in DB after extraction
- [ ] SSE stream delivers all intermediate status events in correct order
- [ ] `chunkCount` is set correctly on READY
- [ ] Kafka topics contain expected events in correct order

---

## Test Infrastructure

### Docker Services Required

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
  redpanda:
    image: redpandadata/redpanda:latest
    ports: ["19092:19092"]
```

### External API Mocks

| Service | Mock Strategy |
|---------|--------------|
| Claude Haiku | Mock `@anthropic-ai/sdk` — return fixture text for test PDFs |
| VoyageAI | Mock `voyageai` — return random float arrays of correct dimension |
| Weaviate | Mock adapter — in-memory store, verify upsert calls |

---

## Test Cases

### Happy Path — PDF File

| Step | Action | Assert |
|------|--------|--------|
| 1 | `POST /api/files/upload` with `test.pdf` + `tenantId` | 202 response with `fileId` |
| 2 | `GET /api/files/:fileId` | `status: 'processing'` |
| 3 | Open SSE `GET /api/files/:fileId/events` | Connection established |
| 4 | Wait for agent to consume `file.uploaded` | Agent logs show processing started |
| 5 | Agent calls Haiku mock | Mock returns extracted text fixture |
| 6 | SSE receives `{ status: 'extracted' }` | Event delivered |
| 7 | `GET /api/files/:fileId` | `status: 'extracted'`, `parsedText` populated, `extractionMethod: 'haiku'` |
| 8 | Agent chunks and embeds | VoyageAI mock called, Weaviate mock receives upserts |
| 9 | SSE receives `{ status: 'ready' }` | Stream completes |
| 10 | `GET /api/files/:fileId` | `status: 'ready'`, `chunkCount > 0` |
| 11 | Check Kafka topics | `file.uploaded`, `file.extracted`, `file.ready` events in order |

### Happy Path — TXT File

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload `test.txt` | 202 response |
| 2 | Wait for pipeline completion | SSE receives `extracted` then `ready` |
| 3 | `GET /api/files/:fileId` | `extractionMethod: 'raw'`, `parsedText` matches file content verbatim |

### Happy Path — MD File

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload `test.md` (markdown with headings, lists) | 202 response |
| 2 | Wait for completion | `extractionMethod: 'raw'`, content preserved with markdown syntax |

### Happy Path — JSON File

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload `test.json` | 202 response |
| 2 | Wait for completion | `extractionMethod: 'raw'`, valid JSON string in `parsedText` |

### Rejection — Unsupported File Types

| # | File | Expected |
|---|------|----------|
| 1 | `test.docx` | 400, message contains "Unsupported file type" |
| 2 | `test.mp4` | 400 |
| 3 | `test.csv` | 400 |
| 4 | `test.xlsx` | 400 |
| 5 | `test.exe` | 400 |
| 6 | No file attached | 400 |

### Failure — Extraction Error

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload `corrupt.pdf` | 202 (accepted for processing) |
| 2 | Agent Haiku mock throws error | `AgentProcessingError` with `stage: 'extraction'` |
| 3 | Kafka has `file.failed` event | `stage: 'extraction'`, error message present |
| 4 | `GET /api/files/:fileId` | `status: 'failed'`, `errorStage: 'extraction'`, `errorMessage` populated |
| 5 | SSE receives `{ status: 'failed' }` | Stream completes with error |

### Failure — Embedding Error

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload valid `test.pdf` | 202 |
| 2 | Haiku mock succeeds, Voyage mock throws 429 | Extraction succeeds, embedding fails |
| 3 | `parsedText` is persisted | `GET /api/files/:fileId` shows `parsedText` populated (extraction was successful) |
| 4 | Kafka has `file.extracted` AND `file.failed` | Both events present |
| 5 | Final status | `status: 'failed'`, `errorStage: 'embedding'` |

### Failure — Empty File

| Step | Action | Assert |
|------|--------|--------|
| 1 | Upload empty `empty.txt` (0 bytes) | 202 |
| 2 | Agent reads empty text | `AgentProcessingError` stage `extraction` or `chunking` |
| 3 | Final status | `status: 'failed'` |

### SSE Event Order

| # | Test | Assert |
|---|------|--------|
| 1 | Subscribe to SSE before upload completes | Receive events in order: `extracted` → `ready` (minimum) |
| 2 | Subscribe to SSE after upload, before completion | Receive remaining events from current status onward |
| 3 | SSE stream closes after terminal status | No more events after `ready` or `failed` |

---

## Test Fixtures

| File | Purpose |
|------|---------|
| `test/fixtures/test.pdf` | Small 2-page PDF with text, a table, and a heading |
| `test/fixtures/test.txt` | Plain text file (~500 chars) |
| `test/fixtures/test.md` | Markdown with headings, lists, code blocks |
| `test/fixtures/test.json` | Valid JSON object (~1KB) |
| `test/fixtures/corrupt.pdf` | Invalid PDF (random bytes with .pdf extension) |
| `test/fixtures/empty.txt` | Zero-byte file |
| `test/fixtures/test.docx` | DOCX file for rejection test |

---

## Running the Tests

```bash
# Start infrastructure
docker compose -f docker-compose.test.yml up -d

# Run E2E tests
pnpm exec nx e2e backend-e2e --testPathPattern=ingestion

# Teardown
docker compose -f docker-compose.test.yml down -v
```
