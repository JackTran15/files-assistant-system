# [Done] - SR-05: Ingestion Consumer — Simplified Pipeline

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 3                                         |
| **Priority**  | P1 — Ingestion path                       |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-01, SR-02, SR-04                       |
| **Blocks**    | SR-10                                     |
| **Lane**      | Lane 2 (Ingestion — parallel with Lane 3) |

---

## Description

Rewrite the ingestion consumer to a minimal 3-step pipeline: **extract → chunk → store**. Remove all LLM-based ingestion steps (semantic boundary detection, parent summarization) and the Voyage embedding step. The only LLM call remaining is PDF text extraction via Haiku.

Delete the now-unused tools: `semantic-chunker.tool.ts` and `chunk-summarizer.tool.ts`.

---

## Acceptance Criteria

- [ ] Ingestion pipeline is: extract text → chunk (enhanced heuristic chunker) → store chunks in Weaviate (no vectors)
- [ ] No calls to `detectSemanticBoundaries` (deleted)
- [ ] No calls to `summarizeChunks` (deleted)
- [ ] No calls to `embedWithRetry` / Voyage API
- [ ] No `ParentChunkData` / `ChildChunkData` construction
- [ ] Uses `StoragePort` (SR-04) instead of `EmbeddingPort`
- [ ] Uses enhanced `RecursiveTextChunker` (SR-02) with offset tracking
- [ ] `file.extracted` event still published (backend persistence unchanged)
- [ ] `file.ready` event published with `chunksCreated` on success
- [ ] `file.failed` event published with appropriate `stage` on error
- [ ] `semantic-chunker.tool.ts` deleted
- [ ] `chunk-summarizer.tool.ts` deleted
- [ ] `pnpm exec nx build agent` compiles
- [ ] TXT/MD/JSON ingestion requires zero LLM calls
- [ ] PDF ingestion requires exactly one LLM call (Haiku extraction)

---

## Files to Delete

| File | Reason |
|------|--------|
| `apps/agent/src/tools/semantic-chunker.tool.ts` | LLM-based chunking replaced by heuristic |
| `apps/agent/src/tools/chunk-summarizer.tool.ts` | Summaries only existed for embedding |

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/consumers/ingestion.consumer.ts` | Rewrite to 3-step pipeline, inject `StoragePort` instead of `EmbeddingPort` |

---

## Implementation Notes

### Simplified Consumer

```typescript
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

@Controller()
export class IngestionConsumer {
  private readonly logger = new Logger(IngestionConsumer.name);
  private readonly chunker = new RecursiveTextChunker();

  constructor(
    private readonly kafkaEventAdapter: KafkaEventAdapter,
    @Inject(STORAGE_PORT)
    private readonly storageAdapter: StoragePort,
  ) {}

  @EventPattern(TOPICS.FILE_UPLOADED)
  async handleFileUploaded(@Payload() event: FileUploadedEvent): Promise<void> {
    this.logger.log(`[${event.fileId}] Starting ingestion: ${event.fileName}`);

    try {
      // Step 1: Extract text
      const { text, method } = await extractTextTool.execute!({
        fileId: event.fileId,
        storagePath: event.storagePath,
        mimeType: event.mimeType,
      });
      this.logger.log(`[${event.fileId}] Extracted ${text.length} chars via ${method}`);

      await this.kafkaEventAdapter.publishFileExtracted({
        fileId: event.fileId,
        tenantId: event.tenantId,
        parsedText: text,
        extractionMethod: method,
        characterCount: text.length,
      });

      // Step 2: Chunk
      const { chunkOffsets } = this.chunker.chunk(text, {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });
      this.logger.log(`[${event.fileId}] Created ${chunkOffsets.length} chunks`);

      if (chunkOffsets.length === 0) {
        throw new AgentProcessingError('Text produced zero chunks', 'chunking', false);
      }

      // Step 3: Store (no vectors)
      const metadata = chunkOffsets.map((c, i) => ({
        fileId: event.fileId,
        fileName: event.fileName,
        chunkIndex: i,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      }));

      const result = await this.storageAdapter.storeChunks(
        chunkOffsets.map((c) => c.content),
        metadata,
        event.tenantId,
      );

      await this.kafkaEventAdapter.publishFileReady({
        fileId: event.fileId,
        tenantId: event.tenantId,
        chunksCreated: result.chunksStored,
        vectorsStored: 0,
      });

      this.logger.log(`[${event.fileId}] Ingestion complete`);
    } catch (error) {
      const stage = error instanceof AgentProcessingError ? error.stage : 'extraction';
      const validStage = (['extraction', 'chunking', 'embedding'] as const).includes(
        stage as 'extraction' | 'chunking' | 'embedding',
      )
        ? (stage as 'extraction' | 'chunking' | 'embedding')
        : 'extraction';

      await this.kafkaEventAdapter.publishFileFailed({
        fileId: event.fileId,
        tenantId: event.tenantId,
        error: error instanceof Error ? error.message : String(error),
        stage: validStage,
      });
      this.logger.error(`[${event.fileId}] Ingestion failed at ${validStage}`, error);
    }
  }
}
```

### What's Removed

| Removed Code | Reason |
|-------------|--------|
| `import { detectSemanticBoundaries }` | LLM-based chunking gone |
| `import { summarizeChunks }` | Summarization gone |
| `import Anthropic` (in consumer) | No direct Anthropic calls in consumer |
| `setIngestionAnthropicClient` | No Anthropic client needed in consumer |
| `CHILD_CHUNK_SIZE`, `CHILD_CHUNK_OVERLAP` | No child chunks |
| All `ParentChunkData[]` / `ChildChunkData[]` construction | Flat chunks only |
| `embeddingAdapter.embedAndStoreHierarchical` | Replaced by `storageAdapter.storeChunks` |

### What's Kept

- `extractTextTool.execute` (PDF extraction via Haiku is still valuable)
- `kafkaEventAdapter.publishFileExtracted` / `publishFileReady` / `publishFileFailed`
- Error handling with `AgentProcessingError` stages

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | TXT file ingestion: extract → chunk → store → ready | All steps called in order, zero Anthropic/Voyage calls |
| 2 | PDF file ingestion: extract (Haiku) → chunk → store → ready | One Haiku call, zero Voyage calls |
| 3 | `file.extracted` published before chunking | Call order verified |
| 4 | `file.ready` includes correct `chunksCreated` | Count matches chunks stored |
| 5 | Extraction failure → `file.failed` with `stage: 'extraction'` | Error event published |
| 6 | Zero chunks → `file.failed` with `stage: 'chunking'` | Error event published |
| 7 | Storage failure → `file.failed` with `stage: 'embedding'` | Error event published (stage name kept for backward compat) |
| 8 | No imports of `semantic-chunker.tool` or `chunk-summarizer.tool` | Files deleted, imports gone |
| 9 | No import of `EMBEDDING_PORT` | Uses `STORAGE_PORT` instead |
