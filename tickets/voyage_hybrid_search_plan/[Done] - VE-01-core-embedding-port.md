# [Done] - VE-01: Core -- Add EmbeddingPort

## Summary
Add `EmbeddingPort` interface and `EMBEDDING_PORT` DI symbol to `libs/core` for embedding abstraction.

## Files Changed
- `libs/core/src/ports/embedding.port.ts` (new) -- `EmbeddingPort` interface with `embedDocuments` and `embedQuery`
- `libs/core/src/index.ts` -- re-export embedding port

## Details
- `embedDocuments(texts: string[]): Promise<number[][]>` -- batch embed for indexing (Voyage `input_type: 'document'`)
- `embedQuery(text: string): Promise<number[]>` -- single embed for search (Voyage `input_type: 'query'`)
- `EMBEDDING_PORT` symbol for NestJS DI injection
