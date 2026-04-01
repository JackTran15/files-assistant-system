# [Done] - SR-03: Weaviate Collection — Drop Vector & Hierarchical Fields

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P0 — Foundation                           |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| —                                         |
| **Blocks**    | SR-04, SR-05, SR-06                       |
| **Lane**      | Lane 1 (Foundation — parallel with SR-01, SR-02) |

---

## Description

Simplify the Weaviate `FileChunks` collection schema. Remove fields that only existed for the hierarchical parent/child chunking and embedding pipeline: `chunkType`, `summary`, `parentChunkIndex`. The collection retains `vectorizers: none()` (no auto-vectorization) and now stores flat chunks without any vectors — Weaviate's native BM25 handles all search.

**Breaking change**: Existing Weaviate data must be wiped and re-ingested. This is acceptable since source files are preserved on disk.

---

## Acceptance Criteria

- [x] `FileChunkProperties` interface no longer has `chunkType`, `summary`, `parentChunkIndex`
- [x] `ensureFileChunksCollection` creates collection with simplified properties
- [x] `resetFileChunksCollection` still works for dev/test resets
- [x] `vectorizers: none()` retained (no auto-vectorization, BM25 search only)
- [x] `pnpm exec nx build weaviate` compiles
- [ ] Collection can be created fresh and queried via BM25

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/weaviate/src/collections/file-chunks.collection.ts` | Remove `chunkType`, `summary`, `parentChunkIndex` from properties and interface |

---

## Implementation Notes

### Simplified Schema

```typescript
export const FILE_CHUNKS_COLLECTION = 'FileChunks';

export interface FileChunkProperties {
  content: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  tenantId: string;
  startOffset: number;
  endOffset: number;
}

export async function ensureFileChunksCollection(
  client: WeaviateClient,
): Promise<void> {
  const exists = await client.collections.exists(FILE_CHUNKS_COLLECTION);
  if (exists) return;

  await client.collections.create({
    name: FILE_CHUNKS_COLLECTION,
    vectorizers: weaviate.configure.vectorizer.none(),
    properties: [
      { name: 'content', dataType: 'text' },
      { name: 'fileId', dataType: 'text' },
      { name: 'fileName', dataType: 'text' },
      { name: 'chunkIndex', dataType: 'int' },
      { name: 'tenantId', dataType: 'text' },
      { name: 'startOffset', dataType: 'int' },
      { name: 'endOffset', dataType: 'int' },
    ],
  });
}
```

### Migration Note

Since the schema is changing (fields removed), existing collections must be dropped and recreated. Add a note to SR-10 (cleanup ticket) to document this in the README migration guide. In development, `resetFileChunksCollection` handles this. In production (if applicable), run the reset before redeploying.

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `ensureFileChunksCollection` creates new collection | Collection exists with 7 properties |
| 2 | Collection has no `chunkType` property | Property not in schema |
| 3 | Collection has no `summary` property | Property not in schema |
| 4 | Collection has no `parentChunkIndex` property | Property not in schema |
| 5 | `resetFileChunksCollection` drops and recreates | Clean collection after reset |
| 6 | BM25 query works on `content` field | Results returned for keyword match |
