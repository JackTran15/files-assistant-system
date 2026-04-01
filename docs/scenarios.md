# Files Assistant — System Scenarios & Architecture Diagrams

This document provides a visual reference for the files-assistant multi-agent system. Each section contains a Mermaid diagram illustrating a key aspect of the architecture, along with explanatory context.

---

## Table of Contents

1. [Multi-Agent Architecture](#1-multi-agent-architecture)
2. [Ingestion Flow](#2-ingestion-flow)
3. [Chat + gRPC Streaming Flow](#3-chat--grpc-streaming-flow)
4. [Citation Confidence Feedback Loop](#4-citation-confidence-feedback-loop)
5. [Error and Degradation Flows](#5-error-and-degradation-flows)
6. [Transport Architecture](#6-transport-architecture)

---

## 1. Multi-Agent Architecture

The system is orchestrated by a **Supervisor** (FilesAssistant) that delegates work to five specialised sub-agents. Each agent is backed by a specific Claude model and exposes purpose-built tools.

```mermaid
graph TB
    subgraph Supervisor["Supervisor — FilesAssistant<br/><i>claude-sonnet-4-20250514</i>"]
        direction TB
        SUP((Supervisor))
    end

    subgraph SearchAgent["SearchAgent<br/><i>claude-3-5-sonnet-20241022</i>"]
        SA_T1[hybridSearch]
        SA_T2[keywordSearch]
    end

    subgraph IngestionAgent["IngestionAgent<br/><i>claude-3-5-sonnet-20241022</i>"]
        IA_T1[extractText]
        IA_T2[chunkText]
        IA_T3[embedAndStore]
    end

    subgraph AnalysisAgent["AnalysisAgent<br/><i>claude-sonnet-4-20250514</i>"]
        AA_T1[getFileContent]
        AA_T2[compareFiles]
    end

    subgraph SummaryAgent["SummaryAgent<br/><i>claude-sonnet-4-20250514</i>"]
        SMA_T1[summarizeDocument]
    end

    subgraph CitationAgent["CitationAgent<br/><i>claude-3-5-sonnet-20241022</i>"]
        CA_T1[evaluateCitationConfidence]
    end

    SUP -->|delegates search| SearchAgent
    SUP -->|delegates ingestion| IngestionAgent
    SUP -->|delegates analysis| AnalysisAgent
    SUP -->|delegates summarisation| SummaryAgent
    SUP -->|delegates citation| CitationAgent
```

**Key points:**

- The Supervisor never calls tools directly — it routes tasks to the appropriate sub-agent.
- `claude-sonnet-4-20250514` is used where complex reasoning is needed (Supervisor, Analysis, Summary).
- `claude-3-5-sonnet-20241022` handles high-throughput or more mechanical tasks (Search, Ingestion, Citation).

---

## 2. Ingestion Flow

When a user uploads a file, the system processes it asynchronously through Kafka and the IngestionAgent pipeline. The client receives real-time status updates via SSE.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Backend as Backend API
    participant Kafka
    participant Agent as IngestionAgent
    participant Weaviate
    participant Postgres

    Client->>Backend: POST /api/files/upload (multipart/form-data)
    Backend->>Postgres: Insert file record (status: pending)
    Backend->>Kafka: Produce → file.uploaded
    Backend-->>Client: 202 Accepted (fileId)

    Note over Client,Backend: Client opens SSE connection<br/>GET /api/files/:id/events

    Kafka->>Agent: Consume ← file.uploaded

    rect rgb(230, 245, 230)
        Note right of Agent: IngestionAgent Pipeline
        Agent->>Agent: extractText(file)
        alt Extraction fails
            Agent->>Kafka: Produce → file.failed (reason: extraction_error)
            Kafka->>Backend: Consume ← file.failed
            Backend->>Postgres: Update file (status: failed)
            Backend-->>Client: SSE event: file.failed
        end

        Agent->>Agent: chunkText(extractedContent)
        alt Chunking fails
            Agent->>Kafka: Produce → file.failed (reason: chunking_error)
            Kafka->>Backend: Consume ← file.failed
            Backend->>Postgres: Update file (status: failed)
            Backend-->>Client: SSE event: file.failed
        end

        Agent->>Weaviate: embedAndStore(chunks)
        alt Embedding/storage fails
            Agent->>Kafka: Produce → file.failed (reason: embedding_error)
            Kafka->>Backend: Consume ← file.failed
            Backend->>Postgres: Update file (status: failed)
            Backend-->>Client: SSE event: file.failed
        end
    end

    Agent->>Kafka: Produce → file.ready
    Kafka->>Backend: Consume ← file.ready
    Backend->>Postgres: Update file (status: ready)
    Backend-->>Client: SSE event: file.ready
```

**Key points:**

- The backend returns `202 Accepted` immediately — all heavy processing is async.
- Three distinct failure points (extraction, chunking, embedding) each produce a `file.failed` event with a specific reason.
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
    participant Supervisor as Supervisor (FilesAssistant)
    participant Search as SearchAgent
    participant Summary as SummaryAgent
    participant Citation as CitationAgent
    participant gRPC as gRPC Stream

    Client->>Backend: POST /api/chat { message, conversationId }
    Backend->>Kafka: Produce → chat.request (correlationId)
    Backend-->>Client: 200 OK { correlationId }

    Note over Client,Backend: Client opens SSE connection<br/>GET /api/chat/stream/:correlationId

    Kafka->>Supervisor: Consume ← chat.request

    rect rgb(230, 240, 255)
        Note right of Supervisor: Multi-Agent Orchestration
        Supervisor->>Search: Find relevant chunks
        Search->>Search: hybridSearch(query)
        Search-->>Supervisor: Search results

        Supervisor->>Summary: Summarise with sources
        Summary->>Summary: summarizeDocument(context)
        Summary-->>Supervisor: Drafted response

        Supervisor->>Citation: Add citations & verify
        Citation->>Citation: evaluateCitationConfidence(response)
        Citation-->>Supervisor: Cited response + confidence score
    end

    rect rgb(255, 245, 230)
        Note over Supervisor,gRPC: Real-time response streaming via gRPC
        Supervisor->>gRPC: StreamChatResponse (chunk 1)
        gRPC->>Backend: chunk 1
        Backend-->>Client: SSE data: chunk 1

        Supervisor->>gRPC: StreamChatResponse (chunk 2)
        gRPC->>Backend: chunk 2
        Backend-->>Client: SSE data: chunk 2

        Supervisor->>gRPC: StreamChatResponse (chunk N — final)
        gRPC->>Backend: chunk N
        Backend-->>Client: SSE data: chunk N (stream complete)
    end

    Backend->>Postgres: Persist conversation + response
```

**Key points:**

- **Kafka** carries the initial `chat.request` (async, durable, retryable).
- **gRPC `StreamChatResponse`** carries the response chunks (real-time, low-latency).
- The backend bridges gRPC chunks into SSE events for the browser client.
- Conversation history is persisted to Postgres after streaming completes.

---

## 4. Citation Confidence Feedback Loop

The CitationAgent scores every response using a weighted confidence formula. If the score falls below the threshold, the system retries through a feedback loop between the SummaryAgent and CitationAgent.

```mermaid
flowchart TD
    Start([SummaryAgent produces<br/>drafted response]) --> Cite[CitationAgent adds citations]
    Cite --> Eval["evaluateCitationConfidence(response)"]

    Eval --> Score{Compute weighted score}

    Score --> Weights["<b>Scoring Weights</b><br/>Coverage: 50%<br/>Validity: 30%<br/>Utilization: 20%"]
    Weights --> Check{"score ≥ 0.7?"}

    Check -- "Yes (high confidence)" --> Accept([Return cited response<br/>to Supervisor])

    Check -- "No (low confidence)" --> RetryCheck{"Retries < 1?"}

    RetryCheck -- "Yes — can retry" --> Refine["[Refining...]<br/>SummaryAgent re-generates<br/>with feedback on weak areas"]
    Refine --> Cite2[CitationAgent re-evaluates<br/>new response]
    Cite2 --> Eval2["evaluateCitationConfidence(response v2)"]
    Eval2 --> Check2{"score ≥ 0.7?"}

    Check2 -- "Yes" --> Accept
    Check2 -- "No (still low)" --> AcceptLow([Accept low-confidence response<br/>after max retries exhausted])

    RetryCheck -- "No — max retries reached" --> AcceptLow
```

**Key points:**

- **Coverage (50%)** — Are all claims backed by source material?
- **Validity (30%)** — Are the cited sources genuine and correctly referenced?
- **Utilization (20%)** — Are the available sources being used effectively?
- The threshold is **0.7**. Responses scoring below this trigger a re-generation loop.
- **Max retries = 1** — the system makes at most one refinement attempt before accepting whatever score it has.

---

## 5. Error and Degradation Flows

The system is designed to degrade gracefully. Rather than returning an error to the user when a single component fails, it falls through a chain of progressively less ideal response types. Poison messages are routed to dead-letter queues.

```mermaid
flowchart TD
    Start([Chat request arrives]) --> Orchestrate[Supervisor orchestrates<br/>Search → Summary → Citation]

    Orchestrate --> CitationOK{"CitationAgent<br/>succeeded?"}

    CitationOK -- Yes --> ConfCheck{"Confidence<br/>≥ 0.7?"}
    ConfCheck -- Yes --> Best(["✅ <b>Best Cited Response</b><br/>High-confidence citations<br/><i>Ideal outcome</i>"])

    ConfCheck -- No --> RetryDone{"Max retries<br/>exhausted?"}
    RetryDone -- No --> Retry["Retry feedback loop<br/>(see §4)"]
    Retry --> ConfCheck

    RetryDone -- Yes --> LowConf(["⚠️ <b>Low-Confidence Cited Response</b><br/>Accepted after max retries<br/><i>Degraded but usable</i>"])

    CitationOK -- "No (CitationAgent failed)" --> SummaryOK{"SummaryAgent<br/>response available?"}
    SummaryOK -- Yes --> RawUncited(["🔶 <b>Raw Uncited Response</b><br/>Summary without citations<br/><i>Further degraded</i>"])

    SummaryOK -- No --> AgentCrash(["❌ <b>Error Response</b><br/>Agent pipeline crashed<br/><i>User sees error message</i>"])

    subgraph DLQ["Dead-Letter Queue (DLQ) Flow"]
        direction TB
        Poison([Poison message<br/>repeated processing failures]) --> DLQRoute{"Source topic?"}
        DLQRoute -- "file.uploaded" --> DLQF[dlq.file.uploaded]
        DLQRoute -- "chat.request" --> DLQC[dlq.chat.request]
        DLQF --> Monitor[Ops monitoring &<br/>manual inspection]
        DLQC --> Monitor
    end

    AgentCrash -.->|"if caused by<br/>poison message"| Poison
```

**Degradation chain (best to worst):**

| Tier | Response Type | Condition |
|------|--------------|-----------|
| 1 | Best cited response | Confidence ≥ 0.7 on first or retry pass |
| 2 | Low-confidence cited response | Confidence < 0.7 after max retries (1) exhausted |
| 3 | Raw uncited response | CitationAgent failed but SummaryAgent output exists |
| 4 | Error response | Agent pipeline crashed entirely |

**DLQ topics:**

- `dlq.file.uploaded` — failed file ingestion messages
- `dlq.chat.request` — failed chat processing messages

---

## 6. Transport Architecture

The system uses two transport mechanisms with clearly separated responsibilities. Kafka handles durable, async event processing. gRPC handles real-time, low-latency response streaming.

```mermaid
graph LR
    subgraph Kafka_Async["<b>Kafka (Redpanda) — Async / Durable</b>"]
        direction TB
        T1["chat.request"]
        T2["file.uploaded"]
        T3["file.ready"]
        T4["file.failed"]
        T5["dlq.chat.request"]
        T6["dlq.file.uploaded"]
    end

    subgraph gRPC_RT["<b>gRPC — Real-Time / Streaming</b>"]
        direction TB
        G1["StreamChatResponse"]
    end

    Client((Client))
    Backend[Backend API]
    Agents[Agent Service]
    Weaviate[(Weaviate)]
    Postgres[(Postgres)]

    Client -->|"HTTP POST"| Backend
    Backend -->|"produce"| T1
    Backend -->|"produce"| T2
    T1 -->|"consume"| Agents
    T2 -->|"consume"| Agents

    Agents -->|"produce"| T3
    Agents -->|"produce"| T4
    T3 -->|"consume"| Backend
    T4 -->|"consume"| Backend

    Agents -.->|"on failure"| T5
    Agents -.->|"on failure"| T6

    Agents ==>|"StreamChatResponse<br/>(response chunks)"| G1
    G1 ==>|"forward chunks"| Backend
    Backend -->|"SSE"| Client

    Agents -->|"embed & query"| Weaviate
    Backend -->|"read/write"| Postgres
```

**Transport responsibilities:**

| Transport | Direction | Topics / RPCs | Purpose |
|-----------|-----------|--------------|---------|
| **Kafka** | Backend → Agent | `chat.request`, `file.uploaded` | Durable task dispatch |
| **Kafka** | Agent → Backend | `file.ready`, `file.failed` | Async status notifications |
| **Kafka** | Agent → DLQ | `dlq.chat.request`, `dlq.file.uploaded` | Poison message quarantine |
| **gRPC** | Agent → Backend | `StreamChatResponse` | Real-time response streaming |
| **SSE** | Backend → Client | (HTTP event stream) | Browser-compatible push |

**Why the split?**

- **Kafka** provides durability, retry semantics, and consumer-group scaling for work that doesn't need instant delivery.
- **gRPC** provides bidirectional streaming with backpressure for response chunks where latency matters.
- **SSE** bridges gRPC to the browser, which cannot consume gRPC directly.

---

## Infrastructure Summary

| Component | Role | Persistence |
|-----------|------|-------------|
| **Postgres** | File metadata, conversations, chat history | Durable (relational) |
| **Weaviate** | Vector-embedded document chunks | Durable (vector) |
| **Redpanda** | Kafka-compatible event broker | Durable (log) |
| **Backend API** | HTTP/SSE gateway, Kafka producer/consumer, gRPC client | Stateless |
| **Agent Service** | Multi-agent orchestration, Kafka consumer, gRPC server | Stateless |
