# [Done] - CFC-01: Wire Selected File Context from UI to Agent

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 5                              |
| **Priority**  | P0 — Chat answers are unscoped without this |
| **Epic**      | Chat File Context              |
| **Depends on**| —                              |
| **Blocks**    | —                              |

---

## Description

The React UI sends selected `fileIds` in the `POST /api/chat` request, and the backend correctly includes them in the `ChatRequestEvent` Kafka payload. However, the agent's `ChatConsumer` only passes `event.message` to `supervisorAgent.streamText()`, dropping `tenantId` and `fileIds`. As a result, the agent has no way to scope search/analysis to the user's selected files. Additionally, the search tools and Weaviate adapter have no support for filtering by specific file IDs.

This ticket wires the full context through: enriching the agent prompt with metadata, adding `fileIds` filtering to the search port/adapter/tools, and updating supervisor instructions.

---

## Acceptance Criteria

- [ ] `ChatConsumer` builds an enriched prompt containing `tenantId` and optional `fileIds` from the `ChatRequestEvent`
- [ ] `SearchPort` interface accepts optional `fileIds` on both `hybridSearch` and `keywordSearch`
- [ ] `WeaviateAdapter` applies a combined `tenantId` AND `fileId` containsAny filter when `fileIds` is provided
- [ ] `hybridSearchTool` schema includes optional `fileIds` parameter and passes it to the adapter
- [ ] `keywordSearchTool` schema includes optional `fileIds` parameter and passes it to the adapter
- [ ] Supervisor agent `customGuidelines` instruct the LLM to use `tenantId` and `fileIds` from the context block
- [ ] When no `fileIds` are selected, behavior is unchanged (search across all tenant files)
- [ ] `pnpm exec nx build agent` passes
- [ ] `pnpm exec nx build core` passes

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/consumers/chat.consumer.ts` | Build enriched prompt with `[Context]` lines for `tenantId` and `fileIds`, pass to `streamText()` |
| `libs/core/src/ports/search.port.ts` | Add optional `fileIds?: string[]` parameter to `hybridSearch` and `keywordSearch` |
| `apps/agent/src/adapters/weaviate.adapter.ts` | Accept `fileIds` param, build AND filter combining `tenantId` + `fileId` containsAny |
| `apps/agent/src/tools/hybrid-search.tool.ts` | Add optional `fileIds` to Zod schema, pass through to adapter |
| `apps/agent/src/tools/keyword-search.tool.ts` | Add optional `fileIds` to Zod schema, pass through to adapter |
| `apps/agent/src/agents/supervisor.agent.ts` | Add `customGuidelines` entries for using context metadata |

---

## Implementation Notes

### ChatConsumer — Enriched Prompt

```typescript
@EventPattern(TOPICS.CHAT_REQUEST)
async handleChatRequest(@Payload() event: ChatRequestEvent): Promise<void> {
  const contextLines = [`[Context] tenantId: ${event.tenantId}`];
  if (event.fileIds?.length) {
    contextLines.push(`[Context] selectedFileIds: ${event.fileIds.join(', ')}`);
  }
  const enrichedPrompt = [...contextLines, `[User] ${event.message}`].join('\n');

  const stream = this.grpcResponseAdapter.createStream(
    event.correlationId,
    event.conversationId,
  );

  const agentResult = await this.supervisorAgent.streamText(enrichedPrompt);
  // ... rest unchanged
}
```

### SearchPort — Updated Interface

```typescript
export interface SearchPort {
  hybridSearch(
    query: string,
    tenantId: string,
    limit?: number,
    alpha?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;

  keywordSearch(
    query: string,
    tenantId: string,
    limit?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;
}
```

### WeaviateAdapter — Combined Filters

```typescript
async hybridSearch(
  query: string,
  tenantId: string,
  limit = 10,
  alpha = 0.75,
  fileIds?: string[],
): Promise<SearchResult[]> {
  const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

  let filters = collection.filter.byProperty('tenantId').equal(tenantId);
  if (fileIds?.length) {
    filters = collection.filter.and(
      filters,
      collection.filter.byProperty('fileId').containsAny(fileIds),
    );
  }

  const result = await collection.query.hybrid(query, {
    vector: queryEmbedding,
    alpha,
    limit,
    filters,
    returnProperties: [...],
  });
  // ...
}
```

Same pattern for `keywordSearch`.

### Search Tools — Schema Update

```typescript
// hybrid-search.tool.ts
parameters: z.object({
  query: z.string().describe('Natural language search query'),
  tenantId: z.string().describe('Tenant identifier'),
  limit: z.number().min(1).max(50).default(10),
  alpha: z.number().min(0).max(1).default(0.75),
  fileIds: z.array(z.string()).optional().describe('Scope results to these file IDs only'),
}),
execute: async (input) => {
  const results = await searchAdapter.hybridSearch(
    input.query, input.tenantId, input.limit, input.alpha, input.fileIds,
  );
  return { results, query: input.query };
},
```

### Supervisor Guidelines Addition

```typescript
customGuidelines: [
  // ... existing guidelines ...
  'The user message includes [Context] lines with tenantId and optionally selectedFileIds.',
  'ALWAYS pass tenantId from context to all search/analysis tool calls.',
  'When selectedFileIds are present, pass them as fileIds to search tools to scope results.',
],
```

---

## Test Plan

### Unit Tests

| # | Test | Assert |
|---|------|--------|
| 1 | `ChatConsumer` with fileIds builds enriched prompt containing `[Context] selectedFileIds:` | Verify `streamText` is called with prompt containing file IDs |
| 2 | `ChatConsumer` without fileIds omits selectedFileIds line | Verify prompt has only `[Context] tenantId:` and `[User]` lines |
| 3 | `hybridSearchTool` with fileIds passes them to adapter | Mock adapter receives `fileIds` array |
| 4 | `hybridSearchTool` without fileIds passes undefined | Mock adapter receives no `fileIds` |
| 5 | `WeaviateAdapter.hybridSearch` with fileIds applies AND filter | Verify combined filter is used in query |
| 6 | `WeaviateAdapter.hybridSearch` without fileIds uses tenantId-only filter | Verify only tenantId filter (backward compatible) |

### Integration / Manual

| # | Test | Assert |
|---|------|--------|
| 1 | Select files in UI, ask "Summarize these" | Agent response references only selected files |
| 2 | No files selected, ask "What files do I have?" | Agent searches all tenant files (unchanged behavior) |
| 3 | Select 1 file, ask for summary | Response is scoped to that single file's content |
