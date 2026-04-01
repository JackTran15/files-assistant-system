# [Done] - SR-07: Tools — Consolidate Search + Remove Fake Tools

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 3                                         |
| **Priority**  | P1 — Search path                          |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-06                                     |
| **Blocks**    | SR-08                                     |
| **Lane**      | Lane 3 (Search — parallel with Lane 2)    |

---

## Description

Consolidate the two search tools (`hybridSearchTool`, `keywordSearchTool`) into a single `searchFilesTool` that uses BM25. Simplify `getFileContentTool` to use `getFileChunks` (no parent/child logic). Remove all fake heuristic tools that pretend to be intelligent: `summarizeDocumentTool`, `compareFilesTool`, `evaluateCitationConfidenceTool`.

After this ticket, the agent has exactly 2 tools: `searchFiles` and `readFile`.

---

## Acceptance Criteria

- [x] `hybridSearchTool` → deleted (replaced by `searchFilesTool`)
- [x] `keywordSearchTool` → deleted (replaced by `searchFilesTool`)
- [x] `summarizeDocumentTool` → deleted
- [x] `compareFilesTool` → deleted
- [x] `evaluateCitationConfidenceTool` → deleted
- [x] New `searchFilesTool` created using BM25 search via `SearchPort`
- [x] `getFileContentTool` simplified → renamed to `readFileTool`, uses `getFileChunks`
- [x] `readFileTool` concatenates chunks up to `MAX_CONTENT_CHARS` budget with skip markers
- [x] Tool parameter schemas use `tenantId` and `fileIds` (optional for search, required for read)
- [x] `pnpm exec nx build agent` compiles

---

## Files to Delete

| File | Reason |
|------|--------|
| `apps/agent/src/tools/hybrid-search.tool.ts` | Replaced by `searchFilesTool` |
| `apps/agent/src/tools/keyword-search.tool.ts` | Replaced by `searchFilesTool` |
| `apps/agent/src/tools/summarize-document.tool.ts` | Fake tool (text truncation + word frequency) |
| `apps/agent/src/tools/compare-files.tool.ts` | Fake tool (word-set overlap) |
| `apps/agent/src/tools/evaluate-citation-confidence.tool.ts` | Fake tool (regex citation counter) |

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/agent/src/tools/search-files.tool.ts` | BM25 search across files |

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/tools/get-file-content.tool.ts` | Simplify to use `getFileChunks`, rename to `readFileTool` |

---

## Implementation Notes

### `searchFilesTool`

```typescript
const MAX_CHUNK_CHARS = parseInt(process.env['MAX_SEARCH_CHUNK_CHARS'] || '1200', 10);

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

export const searchFilesTool = createTool({
  name: 'searchFiles',
  description: 'Search uploaded documents by keyword using BM25. Returns matching text chunks with scores.',
  parameters: z.object({
    query: z.string().describe('Search query — keywords, phrases, or questions'),
    tenantId: z.string().describe('Tenant identifier'),
    limit: z.number().min(1).max(20).default(10).describe('Max results'),
    fileIds: z.array(z.string()).optional().describe('Optional: scope search to specific files'),
  }),
  execute: async (input) => {
    if (!searchAdapter) {
      throw new AgentProcessingError('Search adapter not configured', 'search', false);
    }

    const results = await searchAdapter.search(
      input.query, input.tenantId, input.limit, input.fileIds,
    );

    return {
      results: results.map((r) => ({
        ...r,
        content: r.content.length > MAX_CHUNK_CHARS
          ? r.content.slice(0, MAX_CHUNK_CHARS) + '…'
          : r.content,
      })),
      query: input.query,
    };
  },
});
```

### Simplified `readFileTool` (renamed from `getFileContentTool`)

```typescript
export const readFileTool = createTool({
  name: 'readFile',
  description: 'Read the full text content of an uploaded file. For large files, returns evenly-sampled sections.',
  parameters: z.object({
    fileId: z.string().describe('File ID to read'),
    tenantId: z.string().describe('Tenant identifier'),
  }),
  execute: async (input) => {
    // Uses weaviateAdapter.getFileChunks() — flat chunks, no parent/child
    const chunks = await weaviateAdapter.getFileChunks(input.fileId, input.tenantId);

    if (chunks.length === 0) {
      return { fileId: input.fileId, content: '[No content found]', includedChunks: 0, totalChunks: 0 };
    }

    const { content, includedChunks, totalChunks } = selectRepresentativeChunks(chunks, MAX_CONTENT_CHARS);

    return {
      fileId: input.fileId,
      content,
      includedChunks,
      totalChunks,
      sampled: includedChunks < totalChunks,
    };
  },
});
```

The `selectRepresentativeChunks` helper from the current `get-file-content.tool.ts` is still useful — keep it. Just remove the fallback to `keywordSearch` when no child chunks are found.

### Why Each Fake Tool Is Removed

| Tool | What it actually does | Why the LLM is better |
|------|----------------------|----------------------|
| `summarizeDocument` | Truncates text to char budget, counts word frequency | Sonnet can summarize directly from `readFile` output |
| `compareFiles` | Computes word-set intersection/difference | Sonnet can read both files and identify meaningful differences |
| `evaluateCitationConfidence` | Counts `[N]` markers with regex | Cannot verify citation accuracy; only checks citation count |

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `searchFiles` returns BM25 results | Non-empty results for matching query |
| 2 | `searchFiles` with `fileIds` scopes results | Only matching files returned |
| 3 | `searchFiles` truncates long chunks to `MAX_CHUNK_CHARS` | Content ≤ limit |
| 4 | `readFile` returns full content for small file | All chunks concatenated |
| 5 | `readFile` samples large file within budget | `sampled: true`, content ≤ `MAX_CONTENT_CHARS` |
| 6 | `readFile` with no chunks returns empty marker | `[No content found]` |
| 7 | Deleted tool files no longer importable | Import fails for each deleted tool |
| 8 | No reference to `hybridSearch` in any remaining code | Grep verification |
