# [Done] - SR-06: WeaviateAdapter — BM25-Only Search

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P1 — Search path                          |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-01, SR-03                              |
| **Blocks**    | SR-07                                     |
| **Lane**      | Lane 3 (Search — parallel with Lane 2)    |

---

## Description

Rewrite `WeaviateAdapter` to use BM25-only search, removing the Voyage dependency entirely from the search path. The adapter implements the simplified `SearchPort` (single `search` method from SR-01). Remove the `hybridSearch` method (which called Voyage for query embeddings) and `getChildChunks` (no parent/child distinction). Keep and simplify `keywordSearch` → rename to `search`.

Also add a `getFileChunks` method for retrieving all chunks of a specific file (ordered by chunkIndex) — used by the simplified `getFileContent` tool.

---

## Acceptance Criteria

- [x] `WeaviateAdapter` no longer imports or depends on `VoyageEmbeddingAdapter`
- [x] `hybridSearch` method removed
- [x] `getChildChunks` method removed
- [x] `search()` method uses BM25 only (`collection.query.bm25`)
- [x] `getFileChunks()` fetches all chunks for a fileId, sorted by `chunkIndex`
- [x] No `chunkType` filter in any query (flat chunks)
- [x] No `summary` in `returnProperties`
- [x] Implements updated `SearchPort` from SR-01
- [x] `pnpm exec nx build agent` compiles (with expected breakage in tools — fixed in SR-07)

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/adapters/weaviate.adapter.ts` | Remove Voyage dependency, rewrite to BM25-only, add `getFileChunks` |

---

## Implementation Notes

### Simplified WeaviateAdapter

```typescript
@Injectable()
export class WeaviateAdapter implements SearchPort, OnModuleInit {
  private client!: WeaviateClient;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = await getWeaviateClient({
      host: this.config.get<string>('WEAVIATE_HOST'),
      httpPort: this.config.get<number>('WEAVIATE_HTTP_PORT'),
      grpcPort: this.config.get<number>('WEAVIATE_GRPC_PORT'),
    });
    await ensureFileChunksCollection(this.client);
  }

  private buildFilters(
    collection: { filter: { byProperty(name: string): any } },
    tenantId: string,
    fileIds?: string[],
  ) {
    const filters: any[] = [
      collection.filter.byProperty('tenantId').equal(tenantId),
    ];

    if (fileIds?.length) {
      filters.push(
        collection.filter.byProperty('fileId').containsAny(fileIds),
      );
    }

    if (filters.length === 1) return filters[0];
    return { operator: 'And', filters, value: null };
  }

  async search(
    query: string,
    tenantId: string,
    limit = 10,
    fileIds?: string[],
  ): Promise<SearchResult[]> {
    const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

    const result = await collection.query.bm25(query, {
      limit,
      filters: this.buildFilters(collection, tenantId, fileIds),
      returnProperties: [
        'content', 'fileId', 'fileName', 'chunkIndex',
        'startOffset', 'endOffset',
      ],
    });

    return result.objects.map((obj) => ({
      fileId: String(obj.properties.fileId),
      fileName: String(obj.properties.fileName),
      chunkIndex: Number(obj.properties.chunkIndex),
      content: String(obj.properties.content),
      score: obj.metadata?.score ?? 0,
      metadata: {
        startOffset: obj.properties.startOffset,
        endOffset: obj.properties.endOffset,
      },
    }));
  }

  async getFileChunks(
    fileId: string,
    tenantId: string,
  ): Promise<SearchResult[]> {
    const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

    const filters = {
      operator: 'And' as const,
      filters: [
        collection.filter.byProperty('tenantId').equal(tenantId),
        collection.filter.byProperty('fileId').equal(fileId),
      ],
      value: null,
    };

    const result = await collection.query.fetchObjects({
      limit: 500,
      filters,
      returnProperties: [
        'content', 'fileId', 'fileName', 'chunkIndex',
        'startOffset', 'endOffset',
      ],
    });

    return result.objects
      .map((obj) => ({
        fileId: String(obj.properties.fileId),
        fileName: String(obj.properties.fileName),
        chunkIndex: Number(obj.properties.chunkIndex),
        content: String(obj.properties.content),
        score: 0,
        metadata: {
          startOffset: obj.properties.startOffset,
          endOffset: obj.properties.endOffset,
        },
      }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }
}
```

### Key Changes

| Before | After |
|--------|-------|
| Constructor injects `VoyageEmbeddingAdapter` | Constructor only needs `ConfigService` |
| `hybridSearch` calls `voyageAdapter.generateQueryEmbedding` | Removed entirely |
| `keywordSearch` filters by `chunkType: 'parent'` | No chunkType filter |
| `getChildChunks` filters by `chunkType: 'child'` | Replaced by `getFileChunks` (no chunkType) |
| `buildFilters` accepts `chunkType` param | No `chunkType` param |

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `search()` returns BM25 results for matching query | Results with scores > 0 |
| 2 | `search()` with `fileIds` scopes results | Only matching fileIds returned |
| 3 | `search()` without `fileIds` searches all tenant chunks | Cross-file results |
| 4 | `getFileChunks()` returns all chunks for a file | Count matches stored chunks |
| 5 | `getFileChunks()` sorted by `chunkIndex` | Ascending order |
| 6 | No Voyage import in adapter | Import check |
| 7 | No `chunkType` in any filter | No reference to parent/child in queries |
| 8 | Constructor has no `VoyageEmbeddingAdapter` dependency | Single `ConfigService` param |
