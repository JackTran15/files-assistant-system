# Files Assistant — System Scenarios & Architecture Diagrams

This document provides a visual reference for the files-assistant system. Each section contains a Mermaid diagram illustrating a key aspect of the architecture, along with explanatory context.

---

## Table of Contents

1. [Agent Architecture](#1-agent-architecture)
2. [Ingestion Flow](#2-ingestion-flow)
3. [Chat + gRPC Streaming Flow](#3-chat--grpc-streaming-flow)
4. [Inline Citation & Source Collection](#4-inline-citation--source-collection)
5. [Error and Degradation Flows](#5-error-and-degradation-flows)
6. [Transport Architecture](#6-transport-architecture)

---

## 1. Agent Architecture

The system has two distinct runtime paths — **chat** and **ingestion** — with clearly separated responsibilities.

**Chat** is handled by a single VoltAgent **FilesAssistant** agent backed by Anthropic Claude. It decides which tools to call based on the user's message and its system instructions.

**Ingestion** is a deterministic pipeline in `IngestionConsumer` (no LLM orchestration). It runs extract → chunk → embed → store sequentially when a `file.uploaded` Kafka event arrives.

```mermaid
graph TB
    subgraph ChatPath["Chat Path"]
        direction TB
        FA["FilesAssistant Agent<br/><i>claude-sonnet-4-20250514 (configurable)</i>"]
        T1["searchFiles<br/>Hybrid BM25 + vector"]
        T2["readFile<br/>Full file content via stored chunks"]
        FA --> T1
        FA --> T2
    end

    subgraph IngestionPath["Ingestion Path"]
        direction TB
        IC["IngestionConsumer<br/><i>deterministic pipeline</i>"]
        S1["extractText<br/>PDF via Haiku, raw for TXT/MD/JSON"]
        S2["RecursiveTextChunker"]
        S3["Voyage AI embeddings"]
        S4["Weaviate storage"]
        IC --> S1
        S1 --> S2
        S2 --> S3
        S3 --> S4
    end

    Kafka["Kafka (Redpanda)"]
    Kafka -->|"chat.request"| FA
    Kafka -->|"file.uploaded"| IC
```

**Key points:**

- The FilesAssistant agent uses `streamText` to produce response tokens streamed over gRPC.
- Ingestion does not involve the LLM agent — it is a Kafka consumer running a fixed pipeline.
- PDF extraction uses Anthropic Haiku via the `document` block API; plain text/markdown/JSON are read raw.
- The chat model is configurable via `ANTHROPIC_MODEL` env var (default `claude-sonnet-4-20250514`).

---

## 2. Ingestion Flow

When a user uploads a file, the system processes it asynchronously through Kafka and the `IngestionConsumer` pipeline. The client receives real-time status updates via SSE.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Backend as Backend API
    participant Kafka
    participant Agent as IngestionConsumer
    participant Voyage as Voyage AI
    participant Weaviate
    participant Postgres

    Client->>Backend: POST /api/files/upload (multipart/form-data)
    Backend->>Postgres: Insert file record (status: processing)
    Backend->>Kafka: Produce -> file.uploaded
    Backend-->>Client: 202 Accepted (fileId)

    Note over Client,Backend: Client opens SSE connection<br/>GET /api/files/:id/events

    Kafka->>Agent: Consume <- file.uploaded

    rect rgb(230, 245, 230)
        Note right of Agent: IngestionConsumer Pipeline
        Agent->>Agent: extractText (PDF via Haiku / raw read)
        alt Extraction fails
            Agent->>Kafka: Produce -> file.failed (stage: extraction)
            Kafka->>Backend: Consume <- file.failed
            Backend->>Postgres: Update file (status: failed, errorStage: extraction)
            Backend-->>Client: SSE event: failed
        end

        Agent->>Kafka: Produce -> file.extracted (parsedText, extractionMethod)
        Kafka->>Backend: Consume <- file.extracted
        Backend->>Postgres: Save parsedText, set status: extracted
        Backend-->>Client: SSE event: extracted

        Agent->>Agent: RecursiveTextChunker (chunkSize: 1500, overlap: 200)
        alt Zero chunks produced
            Agent->>Kafka: Produce -> file.failed (stage: chunking)
            Kafka->>Backend: Consume <- file.failed
            Backend->>Postgres: Update file (status: failed, errorStage: chunking)
            Backend-->>Client: SSE event: failed
        end

        Agent->>Agent: buildContextualTexts (enrich chunks with file name + section heading)
        Agent->>Voyage: embedDocuments (contextual texts, input_type: document)
        Agent->>Weaviate: storeChunks (text + vectors)
        alt Embedding or storage fails
            Agent->>Kafka: Produce -> file.failed (stage: embedding)
            Kafka->>Backend: Consume <- file.failed
            Backend->>Postgres: Update file (status: failed, errorStage: embedding)
            Backend-->>Client: SSE event: failed
        end
    end

    Agent->>Kafka: Produce -> file.ready (chunksCreated, vectorsStored)
    Kafka->>Backend: Consume <- file.ready
    Backend->>Postgres: Update file (status: ready, chunkCount)
    Backend-->>Client: SSE event: ready
```

**Key points:**

- The backend returns `202 Accepted` immediately — all heavy processing is async.
- `file.extracted` is published after text extraction and before chunking, so the backend can persist parsed text early.
- Three distinct failure stages (`extraction`, `chunking`, `embedding`) are conveyed via the `stage` field on `file.failed`.
- The `embedding` stage covers both Voyage AI API failures and Weaviate storage failures.
- Contextual enrichment prepends file name and nearest section heading to each chunk before embedding (embedding input only — stored text is unchanged).
- Weaviate stores the vector-embedded chunks; Postgres tracks file metadata and status.

---

## 3. Chat + gRPC Streaming Flow

Chat requests are initiated over HTTP/Kafka but responses stream back in real-time through gRPC. This hybrid transport design separates the fire-and-forget request path from the latency-sensitive response path.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Backend as Backend API
    participant Kafka
    participant Agent as FilesAssistant
    participant Weaviate
    participant gRPC as gRPC Stream
    participant Postgres

    Client->>Backend: POST /api/chat { message, tenantId, fileIds? }
    Backend->>Backend: Validate fileIds are READY (if provided)
    Backend->>Postgres: Save user message, create conversation if needed
    Backend->>Kafka: Produce -> chat.request (correlationId)
    Backend-->>Client: 200 OK { correlationId, conversationId }

    Note over Client,Backend: Client opens SSE connection<br/>GET /api/chat/stream/:correlationId

    Kafka->>Agent: Consume <- chat.request

    rect rgb(230, 240, 255)
        Note right of Agent: Single-Agent Tool Use
        Agent->>Agent: Enrich prompt with [Context] tenantId + fileIds
        Agent->>Agent: streamText (decide which tools to call)
        Agent->>Weaviate: searchFiles (hybrid BM25 + vector)
        Weaviate-->>Agent: Search results with scores
        Agent->>Weaviate: readFile (optional, full file via stored chunks)
        Weaviate-->>Agent: File content chunks
        Note right of Agent: SourceCollector gathers tool outputs
    end

    rect rgb(255, 245, 230)
        Note over Agent,gRPC: Real-time response streaming via gRPC
        Agent->>gRPC: StreamChatResponse (chunk 1)
        gRPC->>Backend: chunk 1
        Backend-->>Client: SSE data: chunk 1

        Agent->>gRPC: StreamChatResponse (chunk 2)
        gRPC->>Backend: chunk 2
        Backend-->>Client: SSE data: chunk 2

        Agent->>gRPC: StreamChatResponse (final chunk + sources)
        gRPC->>Backend: final chunk (done: true, sources array)
        Backend-->>Client: SSE data: final chunk (stream complete)
    end

    Backend->>Postgres: Persist assistant message + sources
```

**Key points:**

- **Kafka** carries the initial `chat.request` (async, durable, retryable).
- **gRPC `StreamChatResponse`** carries the response chunks (real-time, low-latency). The final chunk includes a `sources` array with file references and relevance scores.
- The backend bridges gRPC chunks into SSE events for the browser client.
- SSE includes a **heartbeat** every 15 seconds and a **120-second timeout**. A `POST /api/chat/cancel/:correlationId` endpoint allows explicit stream cancellation.
- Conversation history (user message + assistant response + sources) is persisted to Postgres after streaming completes.
- The backend validates that all requested `fileIds` are in `READY` status before publishing `chat.request`.

---

## 4. Inline Citation & Source Collection

The FilesAssistant agent produces inline citations as part of its natural response generation, guided by system instructions. There is no separate citation sub-agent or post-processing loop.

```mermaid
flowchart TD
    Start(["User asks a question"]) --> Tools["Agent calls searchFiles / readFile"]
    Tools --> Collector["SourceCollector captures tool outputs<br/>(fileId, fileName, chunkIndex, score, content)"]
    Collector --> Generate["Agent generates response with inline [N] citations"]
    Generate --> Stream["Response streamed via gRPC"]
    Stream --> Final["Final chunk includes structured sources array"]

    subgraph SourceDedup["Source Deduplication"]
        direction TB
        Raw["Raw tool results"] --> Filter["Filter: score >= 0.5"]
        Filter --> Dedup["Deduplicate by fileId:chunkIndex"]
        Dedup --> Enrich["Add excerpt, pageNumber"]
    end

    Collector --> SourceDedup
    SourceDedup --> Final
```

**How it works:**

1. The agent's system instructions direct it to add `[N]` citation markers after claims that draw on tool results.
2. A `SourceCollector` hooks into `onToolEnd` — it captures search results from `searchFiles` and chunk data from `readFile`.
3. After streaming completes, collected sources are deduplicated (by `fileId:chunkIndex`), filtered (minimum score `0.5`), and attached to the final gRPC chunk as a structured `sources` array.
4. The frontend renders source details automatically from this structured metadata — the agent does not produce a references section.

**Citation rules (from agent instructions):**

- Number citations starting from 1 in the order that distinct source chunks first appear.
- Place `[N]` immediately after the claim or quote it supports.
- If multiple results from the same file and chunk support a claim, use the same `[N]`.
- Never invent citations — if no sources are available, respond without markers.

---

## 5. Error and Degradation Flows

The system is designed to degrade gracefully. Chat errors are surfaced through the gRPC/SSE path. Ingestion failures are published as `file.failed` with a specific `stage`. Poison messages are routed to dead-letter queues.

```mermaid
flowchart TD
    Start(["Chat request arrives"]) --> Agent["FilesAssistant processes query"]

    Agent --> ToolOK{"Tool calls<br/>succeeded?"}

    ToolOK -- Yes --> Respond(["Agent responds with<br/>inline citations + sources"])

    ToolOK -- "Partial (some tools failed)" --> Partial(["Agent responds with<br/>available information"])

    Agent -- "Agent error / LLM failure" --> ErrorMsg(["Error message streamed<br/>to client via gRPC/SSE"])

    subgraph DLQ["Dead-Letter Queue Flow"]
        direction TB
        Poison(["Poison message<br/>repeated processing failures"]) --> DLQRoute{"Source topic?"}
        DLQRoute -- "file.uploaded" --> DLQF["dlq.file.uploaded"]
        DLQRoute -- "file.extracted" --> DLQE["dlq.file.extracted"]
        DLQRoute -- "chat.request" --> DLQC["dlq.chat.request"]
        DLQF --> Monitor["Ops monitoring &<br/>manual inspection"]
        DLQE --> Monitor
        DLQC --> Monitor
    end

    ErrorMsg -.->|"if caused by<br/>poison message"| Poison
```

**Chat degradation:**

| Tier | Response Type | Condition |
|------|--------------|-----------|
| 1 | Cited response with sources | Tool calls succeed, sources collected |
| 2 | Partial response | Some tools fail, agent responds with available info |
| 3 | Error message | Agent pipeline fails entirely (LLM error, timeout) |

**Ingestion degradation:**

| Stage | Failure | Result |
|-------|---------|--------|
| `extraction` | PDF Haiku error, file not found, unsupported MIME | `file.failed` with `stage: extraction` |
| `chunking` | Zero chunks produced from extracted text | `file.failed` with `stage: chunking` |
| `embedding` | Voyage API failure or Weaviate storage error | `file.failed` with `stage: embedding` |

**DLQ topics:**

- `dlq.file.uploaded` — failed file ingestion messages
- `dlq.file.extracted` — failed extracted text processing
- `dlq.chat.request` — failed chat processing messages

---

## 6. Transport Architecture

The system uses three transport layers with clearly separated responsibilities. Kafka handles durable, async event processing. gRPC handles real-time, low-latency response streaming. SSE bridges gRPC to the browser.

```mermaid
graph LR
    subgraph Kafka_Async["Kafka Redpanda - Async / Durable"]
        direction TB
        T1["chat.request"]
        T2["file.uploaded"]
        T3["file.extracted"]
        T4["file.ready"]
        T5["file.failed"]
        T6["dlq.chat.request"]
        T7["dlq.file.uploaded"]
        T8["dlq.file.extracted"]
    end

    subgraph gRPC_RT["gRPC - Real-Time / Streaming"]
        direction TB
        G1["StreamChatResponse"]
    end

    Client((Client))
    Backend["Backend API"]
    Agents["Agent Service"]
    Weaviate[("Weaviate")]
    Postgres[("Postgres")]

    Client -->|"HTTP POST"| Backend
    Backend -->|"produce"| T1
    Backend -->|"produce"| T2
    T1 -->|"consume"| Agents
    T2 -->|"consume"| Agents

    Agents -->|"produce"| T3
    Agents -->|"produce"| T4
    Agents -->|"produce"| T5
    T3 -->|"consume"| Backend
    T4 -->|"consume"| Backend
    T5 -->|"consume"| Backend

    Agents -.->|"on failure"| T6
    Agents -.->|"on failure"| T7
    Agents -.->|"on failure"| T8

    Agents ==>|"StreamChatResponse<br/>(response chunks)"| G1
    G1 ==>|"forward chunks"| Backend
    Backend -->|"SSE"| Client

    Agents -->|"embed & query"| Weaviate
    Backend -->|"read/write"| Postgres
```

**Transport responsibilities:**

| Transport | Direction | Topics / RPCs | Purpose |
|-----------|-----------|--------------|---------|
| **Kafka** | Backend -> Agent | `chat.request`, `file.uploaded` | Durable task dispatch |
| **Kafka** | Agent -> Backend | `file.extracted`, `file.ready`, `file.failed` | Async status notifications |
| **Kafka** | Agent -> DLQ | `dlq.chat.request`, `dlq.file.uploaded`, `dlq.file.extracted` | Poison message quarantine |
| **gRPC** | Agent -> Backend | `ChatStream.StreamChatResponse` | Real-time response streaming |
| **SSE** | Backend -> Client | (HTTP event stream) | Browser-compatible push |

**Kafka consumer groups:**

| Group | Service | Subscribes to |
|-------|---------|---------------|
| `agent-ingestion` | Agent | `file.uploaded` |
| `agent-chat` | Agent | `chat.request` |
| `backend-notifications` | Backend | `file.ready`, `file.failed`, `file.extracted` |

**Why the split?**

- **Kafka** provides durability, retry semantics, and consumer-group scaling for work that doesn't need instant delivery.
- **gRPC** provides client-streaming with backpressure for response chunks where latency matters.
- **SSE** bridges gRPC to the browser, which cannot consume gRPC directly.

---

## Infrastructure Summary

| Component | Role | Persistence |
|-----------|------|-------------|
| **Postgres** | File metadata, conversations, chat history | Durable (relational) |
| **Weaviate** | Vector-embedded document chunks (HNSW + BM25) | Durable (vector) |
| **Redpanda** | Kafka-compatible event broker | Durable (log) |
| **Backend API** | HTTP/SSE gateway, Kafka producer/consumer, gRPC client | Stateless |
| **Agent Service** | FilesAssistant agent + IngestionConsumer, Kafka consumer, gRPC server | Stateless |
