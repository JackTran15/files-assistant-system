# [Done] - VE-02: Weaviate Collection -- Enable HNSW Vector Index

## Summary
Updated `FileChunks` collection to use HNSW vector index with cosine distance for BYO vectors.

## Files Changed
- `libs/weaviate/src/collections/file-chunks.collection.ts` -- added `vectorIndexConfig` inside `vectorizer.none()` options

## Details
- `weaviate.configure.vectorizer.none({ vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({ distanceMetric: 'cosine' }) })`
- Voyage `voyage-3-lite` produces 1024-dimension vectors
- Breaking change: existing Weaviate data must be wiped and re-ingested
