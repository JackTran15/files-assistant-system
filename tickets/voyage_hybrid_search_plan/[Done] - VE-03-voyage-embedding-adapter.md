# [Done] - VE-03: Voyage Embedding Adapter

## Summary
Implement `EmbeddingPort` with `VoyageAIClient` for document and query embeddings.

## Files Changed
- `apps/agent/src/adapters/voyage-embedding.adapter.ts` (new) -- NestJS injectable adapter
- `package.json` -- added `voyageai` dependency

## Details
- `embedDocuments()`: batch embed with `input_type: 'document'`, batches of 128 (Voyage max)
- `embedQuery()`: single embed with `input_type: 'query'`
- Model configurable via `VOYAGE_MODEL` env (default `voyage-3-lite`)
- API key from `VOYAGE_API_KEY` env
- Errors wrapped as `AgentProcessingError` with `stage: 'embedding'`
