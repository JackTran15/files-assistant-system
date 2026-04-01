# [Done] - VE-05: Storage Adapter -- Accept Vectors

## Summary
Updated `StoragePort` and `WeaviateStorageAdapter` to accept and store vectors alongside chunks.

## Files Changed
- `libs/core/src/ports/storage.port.ts` -- added optional `vectors?: number[][]` parameter
- `apps/agent/src/adapters/weaviate-storage.adapter.ts` -- passes vectors on insert

## Details
- `storeChunks(chunks, metadata, tenantId, vectors?)` -- backward compatible
- When vectors provided, passes to `collection.data.insert({ properties, vectors: vectors[i] })`
- Validates vectors and chunks length match
