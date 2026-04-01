# [Done] - SR-04: Weaviate Storage Adapter — Plain Chunk Inserts

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P1 — Ingestion path                       |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-01, SR-03                              |
| **Blocks**    | SR-05, SR-09                              |
| **Lane**      | Lane 2 (Ingestion — parallel with Lane 3) |

---

## Description

Replace `VoyageEmbeddingAdapter` (which embeds via Voyage and stores vectors) with a simple `WeaviateStorageAdapter` that inserts chunks into Weaviate **without vectors**. The new adapter handles write operations (insert chunks, delete by fileId). Read/search operations stay in `WeaviateAdapter` (updated in SR-06).

This decouples storage from embedding — we no longer need Voyage for writes.

---

## Acceptance Criteria

- [ ] New `WeaviateStorageAdapter` created with `storeChunks()` and `deleteByFileId()` methods
- [ ] `storeChunks()` inserts flat chunks (no vectors, no `chunkType`, no `summary`, no `parentChunkIndex`)
- [ ] `deleteByFileId()` removes all chunks for a given fileId
- [ ] No import of `voyageai` or `VoyageAIClient` in the storage adapter
- [ ] New `StoragePort` interface defined in `libs/core/src/ports/` replacing `EmbeddingPort`
- [ ] `pnpm exec nx build agent` compiles (with expected downstream breakage in consumers — fixed in SR-05)

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/agent/src/adapters/weaviate-storage.adapter.ts` | Write-only Weaviate adapter (insert/delete chunks) |
| `libs/core/src/ports/storage.port.ts` | Interface for chunk storage operations |

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/core/src/index.ts` | Export `StoragePort`, `STORAGE_PORT` |

---

## Implementation Notes

### StoragePort Interface

```typescript
import { ChunkMetadata } from '../types/file.types';

export interface StoragePort {
  storeChunks(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
  ): Promise<{ chunksStored: number }>;

  deleteByFileId(fileId: string, tenantId: string): Promise<void>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
```

### WeaviateStorageAdapter

```typescript
@Injectable()
export class WeaviateStorageAdapter implements StoragePort, OnModuleInit {
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

  async storeChunks(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
  ): Promise<{ chunksStored: number }> {
    const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

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
      });
    }

    return { chunksStored: chunks.length };
  }

  async deleteByFileId(fileId: string, _tenantId: string): Promise<void> {
    const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);
    await collection.data.deleteMany(
      collection.filter.byProperty('fileId').equal(fileId),
    );
  }
}
```

### Note on Batch Inserts

Consider using `collection.data.insertMany()` for better performance if Weaviate client supports it. Check at implementation time — even sequential inserts are fine since we're eliminating the Voyage API round-trip (the actual bottleneck).

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | `storeChunks` inserts N chunks | N objects in collection |
| 2 | Inserted chunks have correct properties | `content`, `fileId`, `fileName`, `chunkIndex`, `tenantId`, offsets |
| 3 | No `vectors` field on inserted objects | Objects stored without vector data |
| 4 | No `chunkType`, `summary`, `parentChunkIndex` on objects | Properties absent |
| 5 | `deleteByFileId` removes all chunks for file | Zero objects remaining for that fileId |
| 6 | `deleteByFileId` does not affect other files | Chunks for other fileIds untouched |
| 7 | Adapter initializes Weaviate client on module init | `onModuleInit` connects and ensures collection |
