# Agent Service Plan

Isolated plan for the VoltAgent agent service (`apps/agent` + `apps/agent-dev`). Can be built independently by a sub-agent. Covers multi-agent wiring, all tool implementations, CitationAgent with confidence loop, embedding pipeline, gRPC streaming adapter, and ingestion/chat consumers.

**Depends on shared libs**: This plan creates `libs/core/src/errors/` and updates `libs/weaviate/`. The Backend plan creates `libs/proto/` and updates `libs/events/`. Both can run in parallel -- shared lib changes are in separate directories.

---

## Checklist

- [ ] A0: Dependencies and config
- [ ] A1: Shared libs owned by agent (core errors, weaviate collection)
- [ ] A2: Voyage AI embedding adapter
- [ ] A3: Weaviate search implementation (hybridSearch, keywordSearch)
- [ ] A4: Agent tools -- implement all stubs (extractText, embedAndStore, hybridSearch, keywordSearch, summarizeDocument, getFileContent, compareFiles)
- [ ] A5: CitationAgent + evaluateCitationConfidence tool
- [ ] A6: Supervisor wiring (models, memory, hooks, confidence loop guidelines)
- [ ] A7: Ingestion consumer (full pipeline, file.ready/file.failed)
- [ ] A8: gRPC response adapter + chat consumer (streaming)
- [ ] A9: KafkaResponseAdapter -> KafkaEventAdapter (narrow scope)
- [ ] A10: Agent config module (DI wiring for adapters)
- [ ] A11: Agent dev server update (CitationAgent, models, dev-adapters)

---

## A0: Dependencies and Config

### Root `package.json`

Add:

```
voyageai
@grpc/grpc-js
@grpc/proto-loader
```

Remove:

```
@ai-sdk/openai
```

### `.env.example`

Add:

```
VOYAGE_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_INGESTION_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_SUMMARY_MODEL=claude-sonnet-4-20250514
ANTHROPIC_ANALYSIS_MODEL=claude-sonnet-4-20250514
ANTHROPIC_SEARCH_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_CITATION_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_SUPERVISOR_MODEL=claude-sonnet-4-20250514
BACKEND_GRPC_URL=localhost:5000
CITATION_CONFIDENCE_THRESHOLD=0.7
CITATION_MAX_RETRIES=1
```

### `apps/agent/src/config/agent-config.schema.ts`

Add all `ANTHROPIC_*_MODEL` vars, `VOYAGE_API_KEY`, `BACKEND_GRPC_URL`, `CITATION_*` to the Zod schema.

---

## A1: Shared Libs Owned by Agent

### `libs/core/src/errors/agent-processing.error.ts` (NEW)

```typescript
export class AgentProcessingError extends Error {
  constructor(
    message: string,
    public readonly stage: 'extraction' | 'chunking' | 'embedding' | 'search' | 'summary' | 'citation',
    public readonly retryable: boolean,
    public readonly cause?: Error,
  ) {
    super(message);
  }
}
```

Export from `libs/core/src/index.ts`.

### `libs/weaviate/src/collections/file-chunks.collection.ts`

Add explicit vectorizer config for external embeddings:

```typescript
await client.collections.create({
  name: FILE_CHUNKS_COLLECTION,
  vectorizers: weaviate.configure.vectorizer.none(),
  properties: [...existing properties...],
});
```

---

## A2: Voyage AI Embedding Adapter

New file: `apps/agent/src/adapters/voyage-embedding.adapter.ts`

Implements `EmbeddingPort` from `@files-assistant/core`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoyageAIClient } from 'voyageai';
import { EmbeddingPort, ChunkMetadata, EmbeddingResult } from '@files-assistant/core';
import { getWeaviateClient, FILE_CHUNKS_COLLECTION } from '@files-assistant/weaviate';

@Injectable()
export class VoyageEmbeddingAdapter implements EmbeddingPort, OnModuleInit {
  private voyage: VoyageAIClient;
  private weaviateClient: WeaviateClient;

  async onModuleInit() {
    this.voyage = new VoyageAIClient({ apiKey: this.config.get('VOYAGE_API_KEY') });
    this.weaviateClient = await getWeaviateClient({...});
  }

  async embedAndStore(chunks: string[], metadata: ChunkMetadata[], tenantId: string): Promise<EmbeddingResult> {
    // 1. Generate embeddings via Voyage AI
    const response = await this.voyage.embed({ input: chunks, model: 'voyage-4-lite' });

    // 2. Upsert to Weaviate with vectors
    const collection = this.weaviateClient.collections.get(FILE_CHUNKS_COLLECTION);
    for (let i = 0; i < chunks.length; i++) {
      await collection.data.insert({
        properties: {
          content: chunks[i],
          fileId: metadata[i].fileId,
          fileName: metadata[i].fileName,
          chunkIndex: metadata[i].chunkIndex,
          tenantId,
          startOffset: metadata[i].startOffset,
          endOffset: metadata[i].endOffset,
        },
        vectors: response.data[i].embedding,
      });
    }

    return { vectorsStored: chunks.length, collectionName: FILE_CHUNKS_COLLECTION };
  }

  async deleteByFileId(fileId: string, tenantId: string): Promise<void> {
    const collection = this.weaviateClient.collections.get(FILE_CHUNKS_COLLECTION);
    await collection.data.deleteMany(
      collection.filter.byProperty('fileId').equal(fileId),
    );
  }
}
```

Error handling: retry Voyage API calls (429 rate limit) with exponential backoff (3 attempts). Throw `AgentProcessingError` with `stage: 'embedding'` on exhaustion.

---

## A3: Weaviate Search Implementation

File: `apps/agent/src/adapters/weaviate.adapter.ts`

Implement the two search methods. Both need query embeddings via Voyage AI for the vector component:

```typescript
async hybridSearch(query: string, tenantId: string, limit = 10, alpha = 0.75): Promise<SearchResult[]> {
  // Generate query embedding
  const queryEmbedding = await this.voyage.embed({ input: [query], model: 'voyage-4-lite' });

  const collection = this.weaviateClient.collections.get(FILE_CHUNKS_COLLECTION);
  const result = await collection.query.hybrid(query, {
    vector: queryEmbedding.data[0].embedding,
    alpha,
    limit,
    filters: collection.filter.byProperty('tenantId').equal(tenantId),
    returnProperties: ['content', 'fileId', 'fileName', 'chunkIndex', 'startOffset', 'endOffset'],
  });

  return result.objects.map(obj => ({
    fileId: obj.properties.fileId,
    fileName: obj.properties.fileName,
    chunkIndex: obj.properties.chunkIndex,
    content: obj.properties.content,
    score: obj.metadata?.score || 0,
    metadata: { startOffset: obj.properties.startOffset, endOffset: obj.properties.endOffset },
  }));
}

async keywordSearch(query: string, tenantId: string, limit = 10): Promise<SearchResult[]> {
  const collection = this.weaviateClient.collections.get(FILE_CHUNKS_COLLECTION);
  const result = await collection.query.bm25(query, {
    limit,
    filters: collection.filter.byProperty('tenantId').equal(tenantId),
    returnProperties: ['content', 'fileId', 'fileName', 'chunkIndex', 'startOffset', 'endOffset'],
  });

  return result.objects.map(obj => ({ ...same mapping... }));
}
```

Inject `VoyageEmbeddingAdapter` for query embedding generation.

---

## A4: Implement All Agent Tools

All tools are in `apps/agent/src/tools/`. Each is a VoltAgent `createTool` with Zod parameters.

### `extract-text.tool.ts`

Wire to `ExtractorRegistry` from `@files-assistant/core`:

```typescript
execute: async ({ filePath, mimeType }) => {
  const registry = new ExtractorRegistry();
  const extractor = registry.getExtractor(mimeType);
  const text = await extractor.extract(filePath);
  return { text, pageCount: text.metadata?.pageCount, metadata: {} };
}
```

Error: catch corrupt PDF / unsupported format, throw `AgentProcessingError` stage `extraction`.

### `embed-and-store.tool.ts`

Delegate to `VoyageEmbeddingAdapter.embedAndStore()`. Pass chunks, metadata, tenantId.

### `hybrid-search.tool.ts` and `keyword-search.tool.ts`

Delegate to `WeaviateAdapter.hybridSearch()` / `keywordSearch()`.

### `summarize-document.tool.ts`

Use `@ai-sdk/anthropic` directly for summarization. The tool accepts document text and produces a structured summary. The SummaryAgent's LLM (claude-sonnet-4) handles the reasoning; this tool provides the formatted output.

### `get-file-content.tool.ts`

Read file from storage path, return full text content. Use `ExtractorRegistry` to handle different file types.

### `compare-files.tool.ts`

Accept two file contents, return structured comparison (similarities, differences, summary).

---

## A5: CitationAgent + Confidence Evaluation

### `apps/agent/src/agents/citation.agent.ts` (NEW)

```typescript
export const citationAgentConfig = {
  name: 'CitationAgent',
  instructions: `You are a citation specialist. Your job has TWO phases:

    PHASE 1 - CITE: Take the raw response and source chunks, rewrite with:
    1. INLINE NUMBERED CITATIONS [1], [2] after each factual claim
    2. QUOTED EXCERPTS using blockquote (> "quote" [N]) for key claims
    3. REFERENCES SECTION at the end with file name, chunk index, description

    PHASE 2 - EVALUATE: After producing the cited response:
    1. Count the number of factual claims you made
    2. Call evaluateCitationConfidence with the cited text, source count, and claim count
    3. Report the confidence score and any weaknesses in your response

    If the tool reports needsRevision: true, explicitly state what was weak so the
    supervisor can ask SummaryAgent to improve those areas.

    Rules:
    - Never invent citations. Every [N] must map to a real source.
    - If no sources are available, return the response unchanged with a note.
    - Preserve the original response's structure and meaning.
    - ALWAYS call evaluateCitationConfidence before finishing.`,
  tools: [evaluateCitationConfidenceTool],
};
```

### `apps/agent/src/tools/evaluate-citation-confidence.tool.ts` (NEW)

Replaces the simpler `validateCitations` from the original plan. Does structural validation + quality scoring:

```typescript
const evaluateCitationConfidenceTool = createTool({
  name: 'evaluateCitationConfidence',
  description: 'Evaluate citation quality: coverage, validity, source utilization.',
  parameters: z.object({
    citedText: z.string().describe('Full cited response with [N] markers'),
    sourceCount: z.number().describe('Total available source chunks'),
    claimCount: z.number().describe('Number of factual claims'),
  }),
  execute: async ({ citedText, sourceCount, claimCount }) => {
    const matches = citedText.match(/\[(\d+)\]/g) || [];
    const uniqueNums = [...new Set(matches.map(m => parseInt(m.replace(/[\[\]]/g, ''))))];

    const coverageScore = Math.min(uniqueNums.length / Math.max(claimCount, 1), 1.0);
    const invalidRefs = uniqueNums.filter(n => n < 1 || n > sourceCount);
    const validityScore = 1 - (invalidRefs.length / Math.max(uniqueNums.length, 1));
    const utilizationScore = Math.min(uniqueNums.length / Math.max(sourceCount, 1), 1.0);
    const overall = coverageScore * 0.5 + validityScore * 0.3 + utilizationScore * 0.2;
    const threshold = parseFloat(process.env.CITATION_CONFIDENCE_THRESHOLD || '0.7');

    const weaknesses: string[] = [];
    if (coverageScore < 0.7) weaknesses.push(`Low coverage: ${uniqueNums.length}/${claimCount} claims cited`);
    if (invalidRefs.length > 0) weaknesses.push(`Invalid refs: ${invalidRefs.join(', ')}`);
    if (utilizationScore < 0.5) weaknesses.push(`${sourceCount - uniqueNums.length} sources unused`);

    return {
      confidenceScore: Math.round(overall * 100) / 100,
      coverageScore: Math.round(coverageScore * 100) / 100,
      validityScore: Math.round(validityScore * 100) / 100,
      utilizationScore: Math.round(utilizationScore * 100) / 100,
      weaknesses,
      needsRevision: overall < threshold,
      threshold,
    };
  },
});
```

Scoring weights: Coverage 50%, Validity 30%, Utilization 20%.

---

## A6: Supervisor Wiring

File: `apps/agent/src/agents/supervisor.agent.ts`

Complete rewrite with:

- Per-agent Anthropic model assignments (from env vars)
- CitationAgent as 5th sub-agent
- `includeAgentsMemory: true`
- `fullStreamEventForwarding` for `text-delta`, `tool-call`, `tool-result`
- Confidence loop guidelines in `supervisorConfig.customGuidelines`
- `onHandoffComplete` hooks: `bail()` for IngestionAgent, fallback for CitationAgent failure

Key supervisor guidelines for the confidence loop:

```typescript
supervisorConfig: {
  customGuidelines: [
    'For search queries, delegate to SearchAgent',
    'For file processing events, delegate to IngestionAgent ONLY (no citation)',
    'For detailed analysis or comparison, delegate to AnalysisAgent',
    'For summarization requests, delegate to SummaryAgent',
    'After ANY response using file content, ALWAYS delegate to CitationAgent as FINAL step',
    'After CitationAgent returns, check its confidence score.',
    'If CitationAgent reports needsRevision AND retry budget remains:',
    '  1. Output: "[Refining response for better citation coverage...]"',
    '  2. Re-delegate to SummaryAgent with weakness feedback',
    '  3. Re-delegate to CitationAgent with improved summary',
    `Max citation retries: ${process.env.CITATION_MAX_RETRIES || '1'}`,
    'If retries exhausted, accept as-is and include the confidence score.',
  ],
  includeAgentsMemory: true,
  fullStreamEventForwarding: {
    types: ['tool-call', 'tool-result', 'text-delta'],
  },
},
hooks: {
  onHandoffComplete: async ({ agent, result, bail, context }) => {
    if (agent.name === 'IngestionAgent') bail();
    if (agent.name === 'CitationAgent' && result.error) {
      context.fallbackToLastSuccessfulResult();
    }
  },
},
```

---

## A7: Ingestion Consumer

File: `apps/agent/src/consumers/ingestion.consumer.ts`

Replace the TODO with full pipeline:

```typescript
@MessagePattern(TOPICS.FILE_UPLOADED)
async handleFileUploaded(@Payload() event: FileUploadedEvent): Promise<void> {
  try {
    // 1. Delegate to supervisor -> IngestionAgent
    const result = await supervisorAgent.generateText({
      input: `Process file: ${event.fileName} (${event.mimeType}) at ${event.storagePath}. 
              TenantId: ${event.tenantId}, FileId: ${event.fileId}.
              Extract text, chunk it, generate embeddings, and store in Weaviate.`,
    });

    // 2. On success, produce file.ready
    await this.kafkaEventAdapter.publishFileReady({
      fileId: event.fileId,
      tenantId: event.tenantId,
      chunksCreated: result.chunksCreated,
    });
  } catch (error) {
    // 3. On failure, produce file.failed with stage
    const stage = error instanceof AgentProcessingError ? error.stage : 'extraction';
    await this.kafkaEventAdapter.publishFileFailed({
      fileId: event.fileId,
      tenantId: event.tenantId,
      error: error.message,
      stage,
    });
  }
}
```

Uses `generateText()` not `streamText()` -- ingestion has no client to stream to. The `bail()` hook in supervisor skips post-processing for IngestionAgent.

---

## A8: gRPC Response Adapter + Chat Consumer

### `apps/agent/src/adapters/grpc-response.adapter.ts` (NEW)

```typescript
@Injectable()
export class GrpcResponseAdapter implements OnModuleInit {
  private chatStreamService: ChatStreamClient;

  constructor(@Inject('CHAT_STREAM_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.chatStreamService = this.client.getService('ChatStream');
  }

  createStream(correlationId: string, conversationId: string): ChatResponseStream {
    const grpcStream = this.chatStreamService.StreamChatResponse();
    return {
      sendChunk: (content: string, done: boolean, options?: StreamChunkOptions) => {
        grpcStream.write({
          correlationId, conversationId, content, done,
          sources: options?.sources || [],
          confidenceScore: options?.confidenceScore,
          revision: options?.revision,
        });
        if (done) grpcStream.end();
      },
      cancel: () => grpcStream.cancel(),
    };
  }
}
```

### `apps/agent/src/consumers/chat.consumer.ts`

```typescript
@MessagePattern(TOPICS.CHAT_REQUEST)
async handleChatRequest(@Payload() event: ChatRequestEvent): Promise<void> {
  const stream = this.grpcResponseAdapter.createStream(event.correlationId, event.conversationId);

  try {
    const agentStream = await supervisorAgent.streamText({ input: event.message });

    for await (const chunk of agentStream.textStream) {
      stream.sendChunk(chunk, false);
    }

    stream.sendChunk('', true, {
      sources: extractedSources,
      confidenceScore: finalConfidenceScore,
      revision: revisionCount,
    });
  } catch (error) {
    stream.sendChunk(`[Error: ${error.message}]`, true);
  }
}
```

### Agent module gRPC client registration

In `apps/agent/src/agent.module.ts`:

```typescript
ClientsModule.register([{
  name: 'CHAT_STREAM_PACKAGE',
  transport: Transport.GRPC,
  options: {
    package: 'chatstream',
    protoPath: join(__dirname, '../../../libs/proto/chat-stream.proto'),
    url: process.env.BACKEND_GRPC_URL || 'localhost:5000',
  },
}]),
```

---

## A9: KafkaResponseAdapter -> KafkaEventAdapter

File: `apps/agent/src/adapters/kafka-response.adapter.ts`

Rename to `kafka-event.adapter.ts`. Remove chat streaming methods. Keep only:

- `publishFileReady(event)` -- produce to `file.ready`
- `publishFileFailed(event)` -- produce to `file.failed`

---

## A10: Agent Config Module

File: `apps/agent/src/config/agent-config.module.ts`

Register all adapters and providers:

- `VoyageEmbeddingAdapter` (provides `EMBEDDING_PORT`)
- `WeaviateAdapter` (provides `SEARCH_PORT`)
- `PostgresAdapter` (provides DB status updates)
- `GrpcResponseAdapter` (provides gRPC streaming)
- `KafkaEventAdapter` (provides async Kafka events)
- gRPC ClientsModule registration

---

## A11: Agent Dev Server

File: `apps/agent-dev/src/main.ts`

- Add CitationAgent with `evaluateCitationConfidenceTool`
- Update model assignments per agent (use env vars or hardcoded Anthropic models)
- Add confidence loop guidelines to supervisor
- Wire `dev-adapters.ts` stubs for isolated testing (mock search results, mock embeddings)

File: `apps/agent-dev/src/dev-adapters.ts`

- Update stubs to return realistic mock data (search results with metadata, embedding results)
- Add `StubVoyageAdapter` for mock embeddings

---

## Error Handling Summary (Agent)

| Error | Stage | Handling |
|-------|-------|----------|
| Corrupt PDF | extraction | `AgentProcessingError`, produce `file.failed` |
| Empty text | extraction | `AgentProcessingError`, produce `file.failed` |
| Voyage rate limit (429) | embedding | Retry 3x with backoff, then `file.failed` |
| Voyage timeout | embedding | 30s timeout, retry once, then `file.failed` |
| Weaviate connection | embedding | Retry 3x with 2s backoff, then `file.failed` |
| Anthropic rate limit | chat | Retry with backoff, stream error if exhausted |
| Context window exceeded | chat | Reduce chunk count, retry with fewer sources |
| Agent timeout | any | 60s per sub-agent, supervisor returns partial |
| CitationAgent failure | citation | Graceful degradation: return raw uncited response |
| Confidence loop failure | citation | Accept previous attempt, attach low score |
| evaluateCitationConfidence error | citation | Treat as score=1.0, skip retry, log warning |
