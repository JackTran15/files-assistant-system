# [Done] - PCE-01: PDF-to-Text Extraction via Claude API

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 5                              |
| **Priority**  | P0 — Core PDF processing       |
| **Epic**      | PDF Claude Extraction          |
| **Depends on**| IV2-01, IV2-02                 |
| **Blocks**    | —                              |

---

## Description

Implement an end-to-end workflow that extracts text from uploaded PDF files using Claude's native PDF document support via the Anthropic API. When a PDF is uploaded, the agent service reads the file as a buffer, sends it base64-encoded to Claude Haiku using the `document` content block, and receives structured text preserving headings, paragraphs, lists, and tables. The extracted text is persisted to Postgres and then chunked/embedded for vector search.

---

## Acceptance Criteria

- [x] PDF files uploaded via `POST /api/files/upload` are accepted (`application/pdf` in MIME allowlist)
- [x] Backend saves the file to disk and publishes `file.uploaded` Kafka event with `mimeType: 'application/pdf'`
- [x] Agent `IngestionConsumer` handles `file.uploaded` and routes PDFs to `extractPdfWithHaiku`
- [x] `extractPdfWithHaiku` sends base64-encoded PDF to Anthropic API using `type: 'document'` content block
- [x] Extraction prompt instructs Claude to preserve structure verbatim (headings, tables as markdown, no summarization)
- [x] Model is configurable via `ANTHROPIC_HAIKU_MODEL` env var (default: `claude-haiku-4-5-20250414`)
- [x] Extraction returns `{ text, method: 'haiku', characterCount }`
- [x] Agent publishes `file.extracted` event with `parsedText`, `extractionMethod: 'haiku'`, `characterCount`
- [x] Backend Kafka consumer saves extracted text to Postgres (`parsedText`, `extractionMethod` columns) and sets status to `EXTRACTED`
- [x] After extraction, text is chunked via `RecursiveTextChunker` and embedded via Voyage AI into Weaviate
- [x] Agent publishes `file.ready` with `chunksCreated` and `vectorsStored` on success
- [x] On failure, agent publishes `file.failed` with error message and `stage: 'extraction'`
- [x] Empty extraction result throws `AgentProcessingError` with `stage: 'extraction'`, `retryable: false`
- [x] Rate limit (429) errors throw `AgentProcessingError` with `retryable: true`
- [x] API timeout errors throw `AgentProcessingError` with `retryable: true`
- [x] File not found (ENOENT) throws `AgentProcessingError` with `retryable: false`
- [x] `@anthropic-ai/sdk` is used (not `@ai-sdk/anthropic`) for native PDF document block support
- [x] SSE events emitted for status transitions (PROCESSING → EXTRACTED → READY or FAILED)

---

## Files Involved

| File | Role |
|------|------|
| `apps/backend/src/modules/files/files.controller.ts` | Upload endpoint with PDF MIME allowlist and multer config |
| `apps/backend/src/modules/files/files.service.ts` | Saves file entity, publishes `file.uploaded`, handles `saveExtractedText` |
| `apps/backend/src/modules/kafka/kafka.consumer.ts` | Consumes `file.extracted` → saves parsed text to Postgres |
| `apps/agent/src/tools/extract-text.tool.ts` | `extractPdfWithHaiku` — sends PDF to Claude Haiku, returns structured text |
| `apps/agent/src/consumers/ingestion.consumer.ts` | Orchestrates: extract → publish extracted → chunk → embed → publish ready |
| `apps/agent/src/adapters/kafka-event.adapter.ts` | `publishFileExtracted`, `publishFileReady`, `publishFileFailed` methods |
| `apps/agent/src/config/agent-config.schema.ts` | `ANTHROPIC_HAIKU_MODEL` env var in Zod schema |
| `apps/agent/src/config/agent-config.module.ts` | Initializes Anthropic client, wires into extract-text tool |
| `libs/events/src/schemas/file-extracted.event.ts` | `FileExtractedEvent` schema with `extractionMethod: 'haiku' \| 'raw'` |
| `libs/events/src/lib/topics.ts` | `FILE_EXTRACTED` topic definition |
| `libs/core/src/types/file.types.ts` | `FileStatus` enum with EXTRACTED status, `FileMetadata` with `parsedText` |

---

## Implementation Details

### Claude Haiku PDF Extraction (`extract-text.tool.ts`)

The core extraction function sends the PDF as a base64-encoded document to Claude Haiku:

```typescript
const response = await anthropicClient.messages.create({
  model, // from ANTHROPIC_HAIKU_MODEL env var
  max_tokens: 16384,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buffer.toString('base64'),
        },
      },
      {
        type: 'text',
        text: 'Extract all text content from this document. Preserve the structure: headings, paragraphs, lists, and tables. For tables, use markdown table format. Do not summarize or interpret — extract verbatim.',
      },
    ],
  }],
});
```

### Error Handling Strategy

| Error Type | Retryable | Handling |
|------------|-----------|----------|
| Rate limit (429) | Yes | Wrapped as `AgentProcessingError`, stage: extraction |
| API timeout | Yes | Wrapped as `AgentProcessingError`, stage: extraction |
| Generic API error | Yes | Wrapped with original error message |
| Empty extraction | No | Non-retryable `AgentProcessingError` |
| File not found (ENOENT) | No | Non-retryable `AgentProcessingError` |

### Ingestion Pipeline Flow

1. `IngestionConsumer` receives `file.uploaded` event
2. Calls `extractTextTool.execute({ fileId, storagePath, mimeType })`
3. For `application/pdf`: reads buffer → `extractPdfWithHaiku` → Claude API
4. Publishes `file.extracted` with parsed text
5. Chunks text with `RecursiveTextChunker`
6. Embeds and stores via `embeddingAdapter.embedAndStore`
7. Publishes `file.ready` on success or `file.failed` on error

---

## Test Plan

### Unit Tests (`apps/agent/src/tools/extract-text.tool.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | Routes `application/pdf` MIME type to Haiku extraction | `extractPdfWithHaiku` called |
| 2 | Haiku receives correct document block | Anthropic SDK called with `type: 'document'`, `media_type: 'application/pdf'` |
| 3 | Extraction prompt asks for verbatim output | Prompt contains "Do not summarize or interpret" |
| 4 | Returns `method: 'haiku'` for PDF | Return value has `method === 'haiku'` |
| 5 | Returns correct `characterCount` | Matches `text.length` |
| 6 | Empty Haiku response throws error | `AgentProcessingError` with `stage: 'extraction'` |
| 7 | Rate limit throws retryable error | `retryable: true` |
| 8 | Missing file throws non-retryable error | `retryable: false` |
| 9 | Uses model from env var | Anthropic `create` called with correct model |

### Integration / Manual

| # | Test | Assert |
|---|------|--------|
| 1 | Upload a PDF via UI or API | File status transitions: PROCESSING → EXTRACTED → READY |
| 2 | Check `parsedText` in DB after extraction | Contains structured text from PDF |
| 3 | Upload a scanned PDF | OCR-extracted text returned by Haiku |
| 4 | Upload a PDF with tables | Tables preserved in markdown format |
| 5 | Chat about an uploaded PDF | Agent retrieves relevant chunks from the PDF |
