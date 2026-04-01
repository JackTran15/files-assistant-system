# [Done] - SR-09: AgentConfigModule — Rewire Providers & Cleanup

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P2 — Agent architecture                   |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-04, SR-06, SR-08                       |
| **Blocks**    | SR-10                                     |
| **Lane**      | Lane 4 (Agent)                            |

---

## Description

Update `AgentConfigModule` to wire up the simplified architecture: single agent, `WeaviateStorageAdapter` for writes, `WeaviateAdapter` (BM25-only) for reads, no Voyage. Remove all dead provider registrations, model map entries for deleted sub-agents, and unused tool setter calls.

---

## Acceptance Criteria

- [ ] `VoyageEmbeddingAdapter` removed from providers and exports
- [ ] `EMBEDDING_PORT` provider removed
- [ ] `WeaviateStorageAdapter` registered as provider for `STORAGE_PORT`
- [ ] `WeaviateAdapter` no longer depends on `VoyageEmbeddingAdapter`
- [ ] Model map simplified: single `ANTHROPIC_MODEL` env var (no per-agent models)
- [ ] `createSupervisorAgent()` replaced by `createFilesAssistantAgent()` — flat agent, no sub-agents
- [ ] Dead tool setter calls removed: `setEmbeddingAdapter`, `setHybridSearchAdapter`, `setKeywordSearchAdapter`
- [ ] Remaining tool setter calls: `setSearchAdapter` (for `searchFilesTool`), `setWeaviateAdapter` (for `readFileTool`)
- [ ] `setAnthropicClient` kept (for PDF extraction in ingestion)
- [ ] `setIngestionAnthropicClient` removed (consumer no longer needs direct Anthropic client)
- [ ] `pnpm exec nx build agent` compiles with zero errors
- [ ] `pnpm exec nx lint agent` passes

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/config/agent-config.module.ts` | Full rewrite of providers, agent factory, and tool setters |

---

## Implementation Notes

### Simplified Module

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Agent } from '@voltagent/core';
import { anthropic } from '@ai-sdk/anthropic';
import { WeaviateStorageAdapter } from '../adapters/weaviate-storage.adapter';
import { WeaviateAdapter } from '../adapters/weaviate.adapter';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { STORAGE_PORT, SEARCH_PORT } from '@files-assistant/core';
import { setSearchAdapter } from '../tools/search-files.tool';
import { setWeaviateAdapter } from '../tools/read-file.tool';
import { setAnthropicClient } from '../tools/extract-text.tool';
import { filesAssistantAgentConfig } from '../agents/files-assistant.agent';
import { toolLoggingHooks } from '../hooks/tool-logging.hooks';
import Anthropic from '@anthropic-ai/sdk';

function createFilesAssistantAgent() {
  const modelId = process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514';

  return new Agent({
    name: filesAssistantAgentConfig.name,
    instructions: filesAssistantAgentConfig.instructions,
    model: anthropic(modelId),
    tools: filesAssistantAgentConfig.tools,
    hooks: toolLoggingHooks,
  });
}

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CHAT_STREAM_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'chatstream',
          protoPath: join(__dirname, '../../../libs/proto/chat-stream.proto'),
          url: process.env['BACKEND_GRPC_URL'] || 'localhost:5050',
        },
      },
    ]),
  ],
  providers: [
    WeaviateStorageAdapter,
    WeaviateAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: WeaviateStorageAdapter,
    },
    {
      provide: SEARCH_PORT,
      useExisting: WeaviateAdapter,
    },
    {
      provide: 'SUPERVISOR_AGENT',  // keep token name for backward compat with chat.consumer
      useFactory: () => createFilesAssistantAgent(),
    },
  ],
  exports: [
    WeaviateStorageAdapter,
    WeaviateAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    STORAGE_PORT,
    SEARCH_PORT,
    'SUPERVISOR_AGENT',
  ],
})
export class AgentConfigModule implements OnModuleInit {
  constructor(
    private readonly weaviateAdapter: WeaviateAdapter,
  ) {}

  onModuleInit() {
    setSearchAdapter(this.weaviateAdapter);
    setWeaviateAdapter(this.weaviateAdapter);
    setAnthropicClient(new Anthropic());
  }
}
```

### What's Removed

| Removed | Reason |
|---------|--------|
| `VoyageEmbeddingAdapter` provider | No embeddings |
| `PostgresAdapter` provider | Check if still used — remove if not |
| `EMBEDDING_PORT` provider | Replaced by `STORAGE_PORT` |
| `MODEL_ENV_MAP` (5 entries) | Single model, single env var |
| `resolveModel()` function | Single `anthropic(modelId)` call |
| `createSupervisorAgent()` | No sub-agents |
| `setEmbeddingAdapter()` call | Tool deleted |
| `setHybridSearchAdapter()` call | Tool deleted |
| `setKeywordSearchAdapter()` call | Tool deleted |
| `setIngestionAnthropicClient()` call | Consumer no longer needs it |

### Environment Variables Simplified

| Before | After |
|--------|-------|
| `ANTHROPIC_SUPERVISOR_MODEL` | `ANTHROPIC_MODEL` (single) |
| `ANTHROPIC_SEARCH_MODEL` | Removed |
| `ANTHROPIC_INGESTION_MODEL` | Removed |
| `ANTHROPIC_ANALYSIS_MODEL` | Removed |
| `ANTHROPIC_SUMMARY_MODEL` | Removed |
| `ANTHROPIC_CITATION_MODEL` | Removed |
| `ANTHROPIC_HAIKU_MODEL` | Kept (for PDF extraction only) |
| `VOYAGE_API_KEY` | Removed |

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Module initializes without error | `onModuleInit` completes |
| 2 | `SUPERVISOR_AGENT` token resolves to single Agent | No sub-agents on the agent |
| 3 | Agent has `searchFiles` and `readFile` tools | Two tools registered |
| 4 | No import of `VoyageEmbeddingAdapter` in module | Import check |
| 5 | No import of `voyage-embedding.adapter` anywhere in config | Grep verification |
| 6 | `STORAGE_PORT` resolves to `WeaviateStorageAdapter` | DI working |
| 7 | `SEARCH_PORT` resolves to `WeaviateAdapter` | DI working |
| 8 | `pnpm exec nx build agent` compiles | Zero errors |
