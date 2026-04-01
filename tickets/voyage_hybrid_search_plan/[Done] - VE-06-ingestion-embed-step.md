# [Done] - VE-06: Ingestion Pipeline -- Embed After Chunking

## Summary
Added embedding step to ingestion: chunk -> contextual enrich -> embed (Voyage) -> store with vectors.

## Files Changed
- `apps/agent/src/consumers/ingestion.consumer.ts` -- inject `EMBEDDING_PORT`, call `buildContextualTexts` and `embedDocuments`

## Details
- Pipeline: extract -> file.extracted -> chunk -> contextual enrich -> embed (Voyage) -> store (text + vectors) -> file.ready
- `file.ready` now includes actual `vectorsStored` count (no longer hardcoded 0)
- Embedding failures produce `file.failed` with `stage: 'embedding'`
