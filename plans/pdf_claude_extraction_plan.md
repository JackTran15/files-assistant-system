# PDF-to-Text Extraction via Claude API

## Summary

When a PDF file is uploaded, the system parses it to structured text using Claude's native PDF document support (Anthropic API). This replaces the legacy `pdf-parse` library approach with an intelligent extraction pipeline that handles complex layouts, tables, OCR, and multi-column text.

---

## Architecture

```mermaid
sequenceDiagram
    participant Client
    participant Backend as Backend (NestJS)
    participant PG as PostgreSQL
    participant RP as Redpanda
    participant Agent as Agent Service
    participant Haiku as Claude Haiku
    participant Voyage as Voyage AI
    participant WV as Weaviate

    Client->>Backend: POST /api/files/upload (PDF)
    Backend->>Backend: Validate MIME type (application/pdf)
    Backend->>PG: Insert file (status: PROCESSING)
    Backend->>RP: Produce file.uploaded
    Backend-->>Client: 202 Accepted {fileId, status}

    RP->>Agent: Consume file.uploaded
    Agent->>Agent: Read PDF as Buffer

    Agent->>Haiku: Send base64 PDF via document content block
    Haiku-->>Agent: Extracted structured text

    Agent->>RP: Produce file.extracted (parsedText, method: 'haiku')
    RP->>Backend: Consume file.extracted
    Backend->>PG: Save parsedText + extractionMethod, status → EXTRACTED

    Agent->>Agent: Chunk text (RecursiveTextChunker)
    Agent->>Voyage: Generate embeddings (voyage-3-lite)
    Agent->>WV: Upsert chunks + vectors

    Agent->>RP: Produce file.ready {chunksCreated, vectorsStored}
    RP->>Backend: Consume file.ready
    Backend->>PG: Update status → READY, set chunkCount
    Backend-->>Client: SSE (status: ready)
```

---

## Key Design Decisions

1. **Claude Haiku for PDF extraction** — Uses Anthropic's native `document` content block type with base64-encoded PDF. This provides superior quality over `pdf-parse` for complex layouts, scanned documents, and tables.

2. **Extraction method tracking** — Each file records its `extractionMethod` (`'haiku'` for PDF, `'raw'` for TXT/MD/JSON) in Postgres for observability.

3. **Error classification** — API errors (rate limits, timeouts) are marked `retryable: true`; content errors (empty text, missing file) are `retryable: false`.

4. **Fire-and-forget `file.extracted`** — The agent publishes the extracted text event and immediately proceeds to chunking/embedding without waiting for the backend to persist it.

---

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | (required) | Anthropic API authentication |
| `ANTHROPIC_HAIKU_MODEL` | `claude-haiku-4-5-20250414` | Model used for PDF extraction |

---

## Tickets

| ID | Title | Points | Status |
|----|-------|--------|--------|
| PCE-01 | PDF-to-Text Extraction via Claude API | 5 | Done |
