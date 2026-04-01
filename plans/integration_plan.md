# Integration and Testing Plan

Final plan to run after both the Backend and Agent plans are complete. Verifies cross-service communication, end-to-end workflows, error flows, and produces the `docs/scenarios.md` diagrams document.

**Prerequisites**: Both `backend_plan.md` and `agent_plan.md` must be fully completed before starting this plan.

---

## Checklist

- [ ] I0: Shared lib contract verification (proto, events, core types align)
- [ ] I1: gRPC connectivity test (agent -> backend streaming)
- [ ] I2: E2E ingestion flow (upload -> extract -> chunk -> embed -> file.ready -> DB update -> SSE)
- [ ] I3: E2E chat flow (POST /chat -> Kafka -> agent supervisor -> gRPC stream -> SSE to client)
- [ ] I4: Citation confidence loop verification (low score -> refine -> re-evaluate)
- [ ] I5: Error flow testing (file.failed, stream timeout, citation degradation, DLQ)
- [ ] I6: Agent dev server smoke test (VoltOps dashboard, tool execution)
- [ ] I7: Create `docs/scenarios.md` with all mermaid diagrams

---

## I0: Shared Lib Contract Verification

Before running any E2E tests, verify that both plans produced compatible artifacts:

- `libs/proto/chat-stream.proto` exists and is used by both Backend gRPC server and Agent gRPC client
- `libs/events/src/lib/topics.ts` no longer has `CHAT_RESPONSE` / `CHAT_RESPONSE_DONE`
- `libs/events/src/schemas/chat-response.event.ts` has `confidenceScore`, `revision`, `excerpt`, `pageNumber` fields
- `libs/core/src/errors/agent-processing.error.ts` is exported from `libs/core/src/index.ts`
- `libs/weaviate/src/collections/file-chunks.collection.ts` uses `vectorizer.none()`
- `@ai-sdk/openai` is removed from root `package.json`
- `voyageai`, `@grpc/grpc-js`, `@grpc/proto-loader` are installed

Run:

```bash
pnpm exec nx lint core
pnpm exec nx lint events
pnpm exec nx build backend
pnpm exec nx build agent
```

All must pass with zero errors.

---

## I1: gRPC Connectivity Test

Start both services and verify gRPC streaming works:

```bash
docker compose up -d                    # infrastructure
pnpm exec nx serve backend &            # HTTP :3000 + gRPC :5000
pnpm exec nx serve agent &              # Kafka consumer + gRPC client
```

Verify:

- Agent logs show successful gRPC client connection to `localhost:5000`
- Backend logs show gRPC microservice started on port 5000
- No connection errors on either side

Manual test: produce a `chat.request` to Redpanda (via `rpk` or Redpanda Console), verify agent connects gRPC stream and backend receives chunks.

---

## I2: E2E Ingestion Flow

Test the complete file upload -> embedding -> status update pipeline.

### Steps

1. Upload a PDF via `POST /api/files/upload` (multipart, with `tenantId`)
2. Verify: response is `202 Accepted` with `{ fileId, status: 'processing' }`
3. Verify: `file.uploaded` event appears in Redpanda
4. Verify: Agent logs show IngestionAgent processing (extract -> chunk -> embed)
5. Verify: Weaviate has chunks stored (query `FileChunks` collection for the fileId)
6. Verify: `file.ready` event appears in Redpanda
7. Verify: `GET /api/files/:id` shows `status: 'ready'` and `chunkCount > 0`
8. Verify: SSE endpoint `GET /api/files/:id/events` pushed a ready event

### Error case

1. Upload a corrupted PDF
2. Verify: Agent produces `file.failed` with `stage: 'extraction'`
3. Verify: `GET /api/files/:id` shows `status: 'failed'`

### Video rejection

1. Upload a `.mp4` file
2. Verify: `400 Bad Request` with message "Video files are not allowed"

---

## I3: E2E Chat Flow

Test the complete chat -> agent -> gRPC stream -> SSE pipeline.

### Prerequisites

At least one file must be ingested (I2 complete).

### Steps

1. `POST /api/chat` with `{ message: "Summarize the uploaded document", tenantId }`
2. Verify: response has `{ correlationId, conversationId }`
3. Open SSE: `GET /api/chat/stream/:correlationId`
4. Verify: text-delta events stream in real-time
5. Verify: response includes inline citations `[1]`, `[2]` with quoted excerpts
6. Verify: final SSE event has `done: true` with `sources` array and `confidenceScore`
7. Verify: `GET /api/chat/history?tenantId=...` shows the conversation with both user and assistant messages
8. Verify: assistant message in DB includes sources and confidence score

### Timing check

Measure latency from first `chat.request` produce to first SSE text-delta received. Should be under 3 seconds (agent processing time, not transport overhead).

---

## I4: Citation Confidence Loop Verification

Test the refinement loop by crafting a scenario where the first citation attempt produces low confidence.

### Setup

Upload a document with dense factual content (many claims, many potential sources).

### Steps

1. Send a chat request that asks for a detailed summary with many facts
2. Monitor agent logs for:
   - First CitationAgent attempt + `evaluateCitationConfidence` call
   - If score < threshold: `[Refining response...]` marker in stream
   - Re-delegation to SummaryAgent with weakness feedback
   - Second CitationAgent attempt + improved score
3. Verify SSE stream shows:
   - First response text
   - `[Refining response for better citation coverage...]` separator
   - Revised response text with better citations
4. Verify final `confidenceScore` is included in the done event
5. Verify `revision` field indicates which attempt was final (0 or 1)

### Edge cases

- Force max retries exhausted: set `CITATION_MAX_RETRIES=0` and verify response is accepted with whatever score
- Force high confidence: ask a simple question, verify no refinement loop triggers

---

## I5: Error Flow Testing

### 5a: File Ingestion Failures

| Test | Input | Expected |
|------|-------|----------|
| Corrupt PDF | Upload a 0-byte .pdf | `file.failed` stage: extraction, DB status: FAILED |
| Password-protected PDF | Upload encrypted .pdf | `file.failed` stage: extraction |
| Unsupported MIME | Upload a `.exe` | Should process as TXT (fallback) or fail gracefully |

### 5b: Stream Failures

| Test | Action | Expected |
|------|--------|----------|
| Client disconnect | Open SSE, close browser mid-stream | Backend cleans up Subject, no memory leak |
| Stream timeout | Stop agent mid-processing | Backend auto-closes SSE after 120s with timeout error |
| Agent crash | Kill agent process during chat | Kafka rebalances, backend sends error after timeout |

### 5c: Citation Degradation

| Test | Action | Expected |
|------|--------|----------|
| CitationAgent LLM error | Simulate Anthropic API failure during citation | Raw uncited response returned |
| No sources found | Ask about content not in any uploaded file | Response with note: "No source documents were referenced" |

### 5d: Kafka DLQ

| Test | Action | Expected |
|------|--------|----------|
| Malformed event | Produce invalid JSON to `chat.request` | Zod validation rejects, logged and skipped |
| Repeated failure | Produce event that causes agent to crash 3x | Published to `dlq.chat.request` |

---

## I6: Agent Dev Server Smoke Test

```bash
pnpm exec nx serve agent-dev    # VoltOps dashboard on :3141
```

Verify:

- Dashboard loads at `http://localhost:3141`
- All 6 agents visible (Supervisor + 5 sub-agents including CitationAgent)
- Can send a test message through the dashboard
- Tool calls execute (with stub/mock data from `dev-adapters.ts`)
- Citation confidence tool works and returns scores
- Model assignments show correct Anthropic models per agent

---

## I7: Create `docs/scenarios.md`

Create `docs/scenarios.md` with mermaid diagrams for all workflows. This serves as the visual reference for the entire system.

### Diagrams to include

**1. Multi-Agent Architecture**

Overview graph showing Supervisor + 5 sub-agents (SearchAgent, IngestionAgent, AnalysisAgent, SummaryAgent, CitationAgent) with their tools and model assignments.

**2. Ingestion Flow**

Sequence diagram: Client -> Backend (multer + Kafka) -> Agent (IngestionAgent: extract -> chunk -> embed -> Weaviate) -> file.ready -> Backend (DB update) -> Client (SSE notification).

Include error branches: file.failed at each stage (extraction, chunking, embedding).

**3. Chat + gRPC Streaming Flow**

Sequence diagram: Client -> Backend (POST /chat + Kafka chat.request) -> Agent (Supervisor -> Search -> Summary -> Citation) -> gRPC stream -> Backend -> SSE -> Client.

Show the gRPC vs Kafka transport split clearly.

**4. Citation Confidence Feedback Loop**

Flowchart: CitationAgent produces response -> evaluateCitationConfidence tool -> score check -> if low: [Refining...] -> SummaryAgent re-generates -> CitationAgent re-evaluates -> accept or retry again.

Include the scoring weights (Coverage 50%, Validity 30%, Utilization 20%).

**5. Error and Degradation Flows**

Diagram showing the graceful degradation chain:
- Best cited response (high confidence)
- Low-confidence cited response (accepted after max retries)
- Raw uncited response (CitationAgent failed)
- Error response (agent crashed)

Show DLQ flow for poison messages.

**6. Transport Architecture**

Graph showing which events use Kafka (async: chat.request, file.uploaded, file.ready, file.failed, dlq.*) vs gRPC (real-time: StreamChatResponse).

---

## Success Criteria

All integration tests pass when:

- [ ] `nx build backend` and `nx build agent` compile with zero errors
- [ ] File upload with video rejection works (400 for video, 202 for PDF)
- [ ] Full ingestion pipeline completes (file status transitions to READY)
- [ ] Chat produces streamed, cited response via SSE with confidence score
- [ ] Citation refinement loop triggers when score is below threshold
- [ ] Error flows produce correct status codes and Kafka events
- [ ] Agent dev server dashboard shows all agents and tools
- [ ] `docs/scenarios.md` contains all 6 diagram categories
