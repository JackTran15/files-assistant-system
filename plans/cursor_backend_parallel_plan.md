# Cursor Execution Plan: Backend Track

This plan converts `plans/backend_plan.md` into an execution checklist optimized for Cursor sub-agents.

## Goal

Deliver the backend stream for hybrid HTTP + gRPC chat streaming, robust file processing updates, SSE stability, and error handling hardening.

## Parallel-Safe Scope

- Owns backend-facing shared libs only: `libs/proto/*`, `libs/events/*`
- Owns service code only: `apps/backend/*`
- Does not modify agent-owned shared libs: `libs/core/src/errors/*`, `libs/weaviate/*`

## TODO List (Execution Order)

### Phase B0-B1: Foundation
- [ ] Add/remove dependencies in root `package.json` (`@grpc/grpc-js`, `@grpc/proto-loader`, remove `@ai-sdk/openai`)
- [ ] Update `.env.example` with `GRPC_PORT`, `BACKEND_GRPC_URL`, and citation threshold/retry vars
- [ ] Extend backend config schema with `GRPC_PORT`
- [ ] Create `libs/proto/chat-stream.proto`
- [ ] Update `libs/events/src/lib/topics.ts` (remove chat response topics, add DLQ topics)
- [ ] Extend `libs/events/src/schemas/chat-response.event.ts` with excerpt/pageNumber/confidence/revision

### Phase B2-B4: Streaming Backbone
- [ ] Add Multer file validation (reject video, 50MB limit)
- [ ] Convert `apps/backend/src/main.ts` to hybrid HTTP + gRPC bootstrap
- [ ] Add `chat-stream.controller.ts` with `@GrpcStreamMethod('ChatStream', 'StreamChatResponse')`
- [ ] Register ChatStream controller in `ChatModule`

### Phase B5-B7: Event and SSE Reliability
- [ ] Update Kafka consumer to handle `FILE_READY` and `FILE_FAILED`
- [ ] Remove old chat response Kafka subscriptions
- [ ] Add/update `FilesService.updateStatus()` and inject service in Kafka consumer
- [ ] Replace fake file SSE with real Subject-based stream per `fileId`
- [ ] Add chat SSE heartbeat (15s), timeout (120s), and disconnect cleanup

### Phase B8-B10: Persistence and Resilience
- [ ] Persist assistant message and sources on final stream chunk
- [ ] Add global `HttpExceptionFilter` and register in `main.ts`
- [ ] Add Kafka producer retries + meaningful errors
- [ ] Roll back DB write in upload flow when Kafka publish fails

## Verification Checklist

- [ ] `pnpm -w test backend` (or repo-specific backend test target)
- [ ] `pnpm -w lint backend` (or repo-specific backend lint target)
- [ ] Manual check: upload non-video under 50MB succeeds
- [ ] Manual check: upload video returns 400
- [ ] Manual check: oversized file returns 413
- [ ] Manual check: chat stream arrives through gRPC and appears in SSE

## Sub-Agent Prompt (Backend)

Use this as a single Cursor sub-agent prompt:

```text
Implement the backend execution plan in plans/cursor_backend_parallel_plan.md.

Constraints:
1) Only modify:
   - apps/backend/**
   - libs/proto/**
   - libs/events/**
   - root config files only when required by this plan (package.json, .env.example)
2) Do not modify:
   - apps/agent/**
   - apps/agent-dev/**
   - libs/core/src/errors/**
   - libs/weaviate/**
3) Follow phases in order: B0-B1, B2-B4, B5-B7, B8-B10.
4) After each phase, run relevant lint/tests and fix introduced issues.
5) Keep implementation aligned with plans/backend_plan.md details.
6) Return:
   - files changed
   - tests/lint commands run and outcomes
   - any open blockers
```

## Optional Split Into 2 Backend Sub-Agents

- Sub-agent A (Infra + Contracts): B0-B1 + B3-B4
- Sub-agent B (Runtime + Reliability): B2 + B5-B10

If split, merge A first so B can compile against final proto/contracts.
