# [Done] - IV2-05: Agent — Rewrite Ingestion Consumer Pipeline

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 3                              |
| **Priority**  | P0 — Core pipeline flow        |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01, IV2-02, IV2-04         |
| **Blocks**    | IV2-09                         |

---

## Description

Rewrite the ingestion consumer in the agent service to use the new sequential pipeline: extract text (Haiku/raw) → publish `file.extracted` → chunk text → embed with VoyageAI → publish `file.ready`. Replace the current supervisor delegation pattern with a direct pipeline. The agent does NOT wait for the backend to process `file.extracted` — it fires and continues.

---

## Acceptance Criteria

- [ ] Consumer listens to `TOPICS.FILE_UPLOADED`
- [ ] Pipeline executes in order: extract → publish extracted → chunk → embed → publish ready
- [ ] `file.extracted` is published with full parsed text before chunking begins
- [ ] `file.ready` is published with `chunksCreated` count on success
- [ ] Extraction failure produces `file.failed` with `stage: 'extraction'`
- [ ] Chunking failure produces `file.failed` with `stage: 'chunking'`
- [ ] Embedding failure produces `file.failed` with `stage: 'embedding'`
- [ ] No supervisor agent delegation for ingestion (direct pipeline, not LLM-driven)
- [ ] Logging at each pipeline stage (extract start/end, chunk count, embed start/end)
- [ ] `pnpm exec nx build agent` compiles with zero errors

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/consumers/ingestion.consumer.ts` | Rewrite: inject extract tool, chunker, embedding adapter, kafka adapter. Sequential pipeline with stage-specific error handling. |
| `apps/agent/src/adapters/kafka-event.adapter.ts` | Add `publishFileExtracted` method |
| `apps/agent/src/agent.module.ts` | Update providers/imports if new injections are needed |

---

## Implementation Notes

### Revised Consumer

```typescript
@EventPattern(TOPICS.FILE_UPLOADED)
async handleFileUploaded(@Payload() event: FileUploadedEvent): Promise<void> {
  this.logger.log(`[${event.fileId}] Starting ingestion: ${event.fileName}`);

  try {
    // Step 1: Extract text
    this.logger.log(`[${event.fileId}] Extracting text (${event.mimeType})`);
    const { text, method } = await this.textExtractor.extract(
      event.storagePath, event.mimeType, event.fileName,
    );
    this.logger.log(`[${event.fileId}] Extracted ${text.length} chars via ${method}`);

    // Step 2: Publish extracted text (fire-and-forget)
    await this.kafkaEventAdapter.publishFileExtracted({
      fileId: event.fileId,
      tenantId: event.tenantId,
      parsedText: text,
      extractionMethod: method,
      characterCount: text.length,
    });

    // Step 3: Chunk
    const chunks = this.chunker.chunk(text);
    this.logger.log(`[${event.fileId}] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new AgentProcessingError('Text produced zero chunks', 'chunking', false);
    }

    // Step 4: Embed and store
    this.logger.log(`[${event.fileId}] Embedding ${chunks.length} chunks`);
    const result = await this.embeddingAdapter.embedAndStore(
      chunks.map(c => c.content),
      chunks.map((c, i) => ({
        fileId: event.fileId, fileName: event.fileName,
        chunkIndex: i, startOffset: c.startOffset, endOffset: c.endOffset,
      })),
      event.tenantId,
    );

    // Step 5: Publish ready
    await this.kafkaEventAdapter.publishFileReady({
      fileId: event.fileId,
      tenantId: event.tenantId,
      chunksCreated: chunks.length,
      vectorsStored: result.vectorsStored,
    });

    this.logger.log(`[${event.fileId}] Ingestion complete`);
  } catch (error) {
    const stage = error instanceof AgentProcessingError ? error.stage : 'extraction';
    await this.kafkaEventAdapter.publishFileFailed({
      fileId: event.fileId,
      tenantId: event.tenantId,
      error: error instanceof Error ? error.message : String(error),
      stage,
    });
    this.logger.error(`[${event.fileId}] Ingestion failed at ${stage}`, error);
  }
}
```

### KafkaEventAdapter Addition

```typescript
async publishFileExtracted(params: {
  fileId: string;
  tenantId: string;
  parsedText: string;
  extractionMethod: 'haiku' | 'raw';
  characterCount: number;
}): Promise<void> {
  const event = createFileExtractedEvent(params);
  await this.producer.send({
    topic: TOPICS.FILE_EXTRACTED,
    messages: [{ key: params.fileId, value: JSON.stringify(event) }],
  });
}
```

---

## Test Plan

### Unit Tests (`apps/agent/src/consumers/ingestion.consumer.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | Successful PDF pipeline: extract → extracted → chunk → embed → ready | All steps called in order. `publishFileExtracted` called before chunking. `publishFileReady` called last with correct `chunksCreated`. |
| 2 | Successful TXT pipeline | Same flow, `extractionMethod` is `'raw'` |
| 3 | Extraction failure publishes `file.failed` stage `extraction` | Mock extractor throw, verify `publishFileFailed` with `stage: 'extraction'` |
| 4 | Chunking failure (zero chunks) publishes `file.failed` stage `chunking` | Mock chunker returning `[]`, verify failed event |
| 5 | Embedding failure publishes `file.failed` stage `embedding` | Mock embedding adapter throw, verify `stage: 'embedding'` |
| 6 | `file.extracted` is published before chunking | Verify call order: `publishFileExtracted` before `chunker.chunk` |
| 7 | Non-AgentProcessingError defaults to `extraction` stage | Throw generic Error, verify stage fallback |
| 8 | Correct event payload for `file.extracted` | Verify `parsedText`, `extractionMethod`, `characterCount` fields |
| 9 | Correct event payload for `file.ready` | Verify `chunksCreated`, `vectorsStored` fields |

### Unit Tests (`apps/agent/src/adapters/kafka-event.adapter.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `publishFileExtracted` sends to correct topic | `producer.send` called with `topic: 'file.extracted'` |
| 2 | Message key is `fileId` | Verify `messages[0].key` |
| 3 | Message value is valid JSON with all fields | Parse and check fields |
| 4 | Event includes auto-generated `timestamp` | Verify ISO string present |
