# [Done] - SR-01: Core Types & Ports — Remove Embedding Interfaces

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P0 — Foundation                           |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| —                                         |
| **Blocks**    | SR-04, SR-05, SR-06                       |
| **Lane**      | Lane 1 (Foundation — parallel with SR-02, SR-03) |

---

## Description

Remove all embedding-related interfaces, types, and ports from `libs/core`. The embedding pipeline is being eliminated — Voyage vectors and hierarchical parent/child chunk types are no longer used. Simplify `SearchResult` to remove the `summary` field. Simplify `SearchPort` to a single `search` method (BM25-only).

---

## Acceptance Criteria

- [ ] `EmbeddingPort` interface and `EMBEDDING_PORT` symbol removed from `libs/core/src/ports/`
- [ ] `embedding.port.ts` deleted
- [ ] `ParentChunkData` and `ChildChunkData` removed from `libs/core/src/types/file.types.ts`
- [ ] `EmbeddingResult`, `SummaryResult`, `ComparisonResult` removed from `libs/core/src/types/agent.types.ts`
- [ ] `SearchResult.summary` field removed (optional → gone)
- [ ] `SearchPort` updated: `hybridSearch` removed, `keywordSearch` renamed to `search`
- [ ] `libs/core/src/index.ts` barrel exports updated
- [ ] `pnpm exec nx build core` compiles (downstream consumers will break — expected, fixed in later tickets)

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/core/src/ports/embedding.port.ts` | **Delete** |
| `libs/core/src/ports/search.port.ts` | Remove `hybridSearch`, rename `keywordSearch` → `search` |
| `libs/core/src/types/file.types.ts` | Remove `ParentChunkData`, `ChildChunkData` |
| `libs/core/src/types/agent.types.ts` | Remove `EmbeddingResult`, `SummaryResult`, `ComparisonResult` |
| `libs/core/src/index.ts` | Update barrel exports |

---

## Implementation Notes

### Updated `SearchPort`

```typescript
export interface SearchPort {
  search(
    query: string,
    tenantId: string,
    limit?: number,
    fileIds?: string[],
  ): Promise<SearchResult[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
```

### Updated `SearchResult`

```typescript
export interface SearchResult {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}
```

### Updated `file.types.ts`

Keep: `FileStatus`, `FileType`, `FileMetadata`, `FileChunk`, `ChunkMetadata`.
Remove: `ParentChunkData`, `ChildChunkData`.

### Updated `agent.types.ts`

Keep: `SearchResult`, `IngestionResult`, `ChunkingResult`.
Remove: `EmbeddingResult`, `SummaryResult`, `ComparisonResult`.

`IngestionResult` update — remove `vectorsStored`:

```typescript
export interface IngestionResult {
  fileId: string;
  chunksCreated: number;
  status: 'success' | 'failure';
  error?: string;
}
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `pnpm exec nx build core` | Zero errors |
| 2 | `SearchPort` has single `search` method | Interface compiles, no `hybridSearch` |
| 3 | `SearchResult` has no `summary` field | Type check passes |
| 4 | No export of `EmbeddingPort`, `EMBEDDING_PORT` from index | Import fails if attempted |
| 5 | No export of `ParentChunkData`, `ChildChunkData` | Import fails if attempted |
