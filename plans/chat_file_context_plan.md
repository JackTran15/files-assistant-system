# Chat File Context — Wire Selected Files to Agent

Ensures the React UI's selected file IDs and tenant context are propagated through the backend Kafka event into the agent's supervisor, search tools, and Weaviate adapter so that chat responses are scoped to the user's selected documents.

---

## Summary of Changes

| Aspect                  | Current Behavior                                    | After This Plan                                                    |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| ChatConsumer invocation | Passes only `event.message` to `streamText()`       | Passes enriched prompt with `tenantId` + `fileIds`                 |
| Search tool tenantId    | LLM must guess the tenant ID                        | `tenantId` provided in prompt context, LLM uses it in tool calls   |
| Search tool fileIds     | Not supported — searches all tenant files            | Optional `fileIds` param scopes results to selected files          |
| Weaviate filtering      | Filters by `tenantId` only                          | Combines `tenantId` + optional `fileId` containsAny filter         |
| Supervisor instructions | No guidance on using context metadata                | Guidelines instruct LLM to use `tenantId` and `fileIds` from context |

---

## 1. Enrich Agent Prompt (ChatConsumer)

Update `apps/agent/src/consumers/chat.consumer.ts` to build a structured prompt that includes `tenantId` and `fileIds` from the `ChatRequestEvent`:

```typescript
const contextLines = [`[Context] tenantId: ${event.tenantId}`];
if (event.fileIds?.length) {
  contextLines.push(`[Context] selectedFileIds: ${event.fileIds.join(', ')}`);
}
const enrichedPrompt = [...contextLines, `[User] ${event.message}`].join('\n');

const agentResult = await this.supervisorAgent.streamText(enrichedPrompt);
```

This ensures the LLM knows which tenant and files to scope tool calls to without requiring changes to VoltAgent's `streamText` signature.

---

## 2. Add `fileIds` to SearchPort Interface

Update `libs/core/src/ports/search.port.ts`:

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

---

## 3. Weaviate Adapter — Combined Filters

Update `apps/agent/src/adapters/weaviate.adapter.ts` to AND the `tenantId` filter with an optional `fileId` containsAny filter:

```typescript
let filters = collection.filter.byProperty('tenantId').equal(tenantId);
if (fileIds?.length) {
  filters = collection.filter.and(
    filters,
    collection.filter.byProperty('fileId').containsAny(fileIds),
  );
}
```

Apply to both `hybridSearch` and `keywordSearch` methods.

---

## 4. Update Search Tools

### `apps/agent/src/tools/hybrid-search.tool.ts`

Add optional `fileIds` parameter:

```typescript
parameters: z.object({
  query: z.string().describe('Natural language search query'),
  tenantId: z.string().describe('Tenant identifier'),
  limit: z.number().min(1).max(50).default(10),
  alpha: z.number().min(0).max(1).default(0.75),
  fileIds: z.array(z.string()).optional().describe('Scope to these file IDs'),
}),
```

Pass `input.fileIds` through to `searchAdapter.hybridSearch(...)`.

### `apps/agent/src/tools/keyword-search.tool.ts`

Same pattern — add optional `fileIds` and pass through.

---

## 5. Supervisor Instructions

Update `apps/agent/src/agents/supervisor.agent.ts` `customGuidelines` with:

```
'The user message includes [Context] lines with tenantId and optionally selectedFileIds.',
'ALWAYS pass tenantId from context to all search/analysis tool calls.',
'When selectedFileIds are present, pass them as fileIds to search tools to scope results.',
```

---

## 6. Files Changed

| File | Change |
|------|--------|
| `apps/agent/src/consumers/chat.consumer.ts` | Enrich prompt with tenantId + fileIds from event |
| `libs/core/src/ports/search.port.ts` | Add optional `fileIds` param to port interface |
| `apps/agent/src/adapters/weaviate.adapter.ts` | Implement `fileIds` filtering with AND filter |
| `apps/agent/src/tools/hybrid-search.tool.ts` | Add optional `fileIds` to tool schema |
| `apps/agent/src/tools/keyword-search.tool.ts` | Add optional `fileIds` to tool schema |
| `apps/agent/src/agents/supervisor.agent.ts` | Add guideline about using context metadata |
