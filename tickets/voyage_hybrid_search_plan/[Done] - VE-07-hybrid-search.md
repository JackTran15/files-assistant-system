# [Done] - VE-07: Search Adapter -- Hybrid Search

## Summary
Replaced BM25-only search with Weaviate hybrid search (BM25 + vector).

## Files Changed
- `apps/agent/src/adapters/weaviate.adapter.ts` -- inject `EMBEDDING_PORT`, use `collection.query.hybrid()`

## Details
- Embeds query via `embeddingAdapter.embedQuery(query)` at search time
- `collection.query.hybrid(query, { vector: queryVector, alpha, limit, filters })`
- Alpha configurable via `HYBRID_ALPHA` env (default 0.75 = 75% vector, 25% BM25)
- `getFileChunks()` unchanged (fetches all chunks for a file, no search needed)
- `SearchPort` interface unchanged externally
