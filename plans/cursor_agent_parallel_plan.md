# Cursor Execution Plan: Agent Track

This plan converts `plans/agent_plan.md` into an execution checklist optimized for Cursor sub-agents.

## Goal

Deliver the agent stream for ingestion + search + citation confidence loop, gRPC response streaming to backend, and config/adapter wiring.

## Parallel-Safe Scope

- Owns agent-facing shared libs only: `libs/core/src/errors/*`, `libs/weaviate/*`
- Owns service code: `apps/agent/*`, `apps/agent-dev/*`
- Does not modify backend-owned shared libs: `libs/proto/*`, `libs/events/*`

## TODO List (Execution Order)

### Phase A0-A1: Foundation
- [ ] Add/remove dependencies in root `package.json` (`voyageai`, `@grpc/grpc-js`, `@grpc/proto-loader`, remove `@ai-sdk/openai`)
- [ ] Update `.env.example` with Voyage, Anthropic model, gRPC, and citation vars
- [ ] Extend `agent-config.schema.ts` with all required env vars
- [ ] Add `libs/core/src/errors/agent-processing.error.ts` and export in `libs/core/src/index.ts`
- [ ] Update Weaviate collection config for external embeddings (`vectorizer.none()`)

### Phase A2-A4: Core Retrieval/Tools
- [ ] Implement `VoyageEmbeddingAdapter` with retry/backoff for 429 and embedding storage
- [ ] Implement `WeaviateAdapter.hybridSearch()` and `keywordSearch()` with tenant filter
- [ ] Implement/finish all tools in `apps/agent/src/tools/`:
- [ ] `extract-text.tool.ts`
- [ ] `embed-and-store.tool.ts`
- [ ] `hybrid-search.tool.ts`
- [ ] `keyword-search.tool.ts`
- [ ] `summarize-document.tool.ts`
- [ ] `get-file-content.tool.ts`
- [ ] `compare-files.tool.ts`

### Phase A5-A6: Citation + Supervisor
- [ ] Add `citation.agent.ts` with two-phase cite/evaluate flow
- [ ] Add `evaluate-citation-confidence.tool.ts` and threshold handling
- [ ] Rewire `supervisor.agent.ts` for:
- [ ] per-agent model assignment
- [ ] CitationAgent as final step for answer flows
- [ ] confidence retry loop and retry budget
- [ ] event forwarding + memory + handoff hooks

### Phase A7-A11: Runtime Integration
- [ ] Replace ingestion consumer TODO with full file processing pipeline
- [ ] Add `grpc-response.adapter.ts`
- [ ] Update `chat.consumer.ts` to stream to backend via gRPC
- [ ] Register gRPC client in `agent.module.ts`
- [ ] Rename/narrow Kafka response adapter -> event adapter (`file.ready`, `file.failed`)
- [ ] Register providers in `agent-config.module.ts`
- [ ] Update `apps/agent-dev` wiring and realistic stubs

## Verification Checklist

- [ ] `pnpm -w test agent` (or repo-specific agent test target)
- [ ] `pnpm -w lint agent` (or repo-specific agent lint target)
- [ ] Manual check: `file.uploaded` triggers extraction/chunk/embed and emits `file.ready`
- [ ] Manual check: ingestion failure emits `file.failed` with stage
- [ ] Manual check: chat requests stream chunks via gRPC and terminate with done metadata
- [ ] Manual check: citation confidence loop runs and respects retry budget

## Sub-Agent Prompt (Agent)

Use this as a single Cursor sub-agent prompt:

```text
Implement the agent execution plan in plans/cursor_agent_parallel_plan.md.

Constraints:
1) Only modify:
   - apps/agent/**
   - apps/agent-dev/**
   - libs/core/src/errors/**
   - libs/weaviate/**
   - root config files only when required by this plan (package.json, .env.example)
2) Do not modify:
   - apps/backend/**
   - libs/proto/**
   - libs/events/**
3) Follow phases in order: A0-A1, A2-A4, A5-A6, A7-A11.
4) After each phase, run relevant lint/tests and fix introduced issues.
5) Keep implementation aligned with plans/agent_plan.md details.
6) Return:
   - files changed
   - tests/lint commands run and outcomes
   - any open blockers
```

## Optional Split Into 3 Agent Sub-Agents

- Sub-agent A (Foundations): A0-A1
- Sub-agent B (Retrieval + Tools): A2-A4
- Sub-agent C (Supervisor + Runtime): A5-A11

If split, merge order: A -> B -> C.
