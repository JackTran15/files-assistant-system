# [Done] - VE-08: Config, Wiring, Env, README, Test Updates

## Summary
Wired all new components together, updated env config, README, and existing tests.

## Files Changed
- `apps/agent/src/config/agent-config.module.ts` -- registered `VoyageEmbeddingAdapter` and `EMBEDDING_PORT`
- `.env.example` -- added `VOYAGE_API_KEY`, `VOYAGE_MODEL`, `HYBRID_ALPHA`
- `README.md` -- updated architecture docs, pipeline diagrams, tech stack, test coverage
- `apps/agent/src/consumers/ingestion.consumer.spec.ts` -- added `EMBEDDING_PORT` mock, embedding failure test, updated assertions

## Details
- `VoyageEmbeddingAdapter` registered as provider bound to `EMBEDDING_PORT`
- `EMBEDDING_PORT` exported for injection into `IngestionConsumer` and `WeaviateAdapter`
- All 40 agent tests pass including new embedding failure test
- TypeScript compiles clean (`nx lint agent` passes)
