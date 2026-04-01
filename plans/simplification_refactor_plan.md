# Agent Simplification Refactor — Drop Embeddings, Flatten Architecture

Supersedes the ingestion-v2 hierarchical chunking + multi-agent supervisor architecture.

---

## Summary

The current pipeline is over-engineered for a file assistant:

- **Ingestion** runs 4 LLM calls + 1 Voyage API call per file (semantic boundary detection, summarization, embedding) when heuristic chunking + BM25 search is sufficient.
- **Chat** routes through 5 sub-agents + 1 supervisor (6 LLM actors per query) with fake heuristic tools pretending to be intelligent (word-frequency "summarization", set-overlap "comparison", regex "citation confidence").
- **Embeddings** are computed from Haiku-generated summaries and only help for cross-file semantic search — a minority use case when users typically select specific files.

This refactor strips the system down to what actually matters:

| Before | After |
|--------|-------|
| Haiku semantic boundary detection | Heuristic heading-aware chunker |
| Haiku parent summarization | Removed (summaries only existed for embedding) |
| Voyage-3-lite embedding | Removed |
| Hierarchical parent/child chunks | Flat chunks |
| Hybrid search (vector + BM25) | BM25-only search |
| 5 sub-agents + supervisor | Single agent with tools |
| `summarizeDocument` (text truncation) | Removed — LLM summarizes directly |
| `compareFiles` (word-set overlap) | Removed — LLM compares directly |
| `evaluateCitationConfidence` (regex) | Removed — citation in system prompt |
| Mandatory CitationAgent post-processing | Removed |

---

## Architecture: Before vs After

### Before — Ingestion

```
File Upload → Extract Text (Haiku/raw)
            → Detect Semantic Boundaries (Haiku)
            → Summarize Parent Chunks (Haiku)
            → Embed Summaries (Voyage-3-lite)
            → Store parents (with vectors) + children (no vectors) in Weaviate
```

### After — Ingestion

```
File Upload → Extract Text (Haiku for PDF / raw for TXT,MD,JSON)
            → Chunk with heading-aware splitter (no LLM)
            → Store flat chunks in Weaviate (no vectors, BM25 only)
```

### Before — Chat

```
User Query → Supervisor (Haiku) routes to:
           → SearchAgent (Haiku) — hybridSearch / keywordSearch
           → AnalysisAgent (Sonnet) — getFileContent / compareFiles
           → SummaryAgent (Sonnet) — summarizeDocument (text truncation)
           → CitationAgent (Haiku) — rewrite + evaluateCitationConfidence (regex)
```

### After — Chat

```
User Query → Single Agent (Sonnet) with tools:
           → searchFiles (BM25)
           → readFile (fetch chunks by fileId)
           → listFiles (list tenant files)
```

---

## Tickets

| ID | Title | Points | Depends On | Blocks | Parallel Lane |
|----|-------|--------|------------|--------|---------------|
| SR-01 | Core Types & Ports — Remove embedding interfaces | 2 | — | SR-04, SR-05, SR-06 | **Lane 1** |
| SR-02 | Enhanced Heuristic Chunker — heading-aware splitting | 2 | — | SR-05 | **Lane 1** |
| SR-03 | Weaviate Collection — Drop vector & hierarchical fields | 2 | — | SR-04, SR-05, SR-06 | **Lane 1** |
| SR-04 | Weaviate Storage Adapter — Plain chunk inserts | 2 | SR-01, SR-03 | SR-05, SR-09 | **Lane 2** |
| SR-05 | Ingestion Consumer — Simplified pipeline | 3 | SR-01, SR-02, SR-04 | SR-10 | **Lane 2** |
| SR-06 | WeaviateAdapter — BM25-only search | 2 | SR-01, SR-03 | SR-07 | **Lane 3** |
| SR-07 | Tools — Consolidate search + remove fake tools | 3 | SR-06 | SR-08 | **Lane 3** |
| SR-08 | Single Agent — Replace supervisor architecture | 3 | SR-07 | SR-09 | **Lane 4** |
| SR-09 | AgentConfigModule — Rewire providers & cleanup | 2 | SR-04, SR-06, SR-08 | SR-10 | **Lane 4** |
| SR-10 | Cleanup — Dead code, dependencies, config, README | 2 | SR-05, SR-09 | — | **Lane 5** |

**Total: 23 points**

---

## Dependency Graph

```
                     ┌─────────────────────────────────────────────────────────┐
                     │              LANE 1 (Foundation — no deps)              │
                     │                                                         │
                     │   SR-01          SR-02           SR-03                  │
                     │  (types)       (chunker)       (weaviate               │
                     │                                 schema)                 │
                     └───┬──┬────────────┬──────────────┬──┬───────────────────┘
                         │  │            │              │  │
              ┌──────────┘  │            │              │  └──────────┐
              │             │            │              │             │
              ▼             │            │              ▼             │
  ┌───────────────────┐    │            │   ┌───────────────────┐   │
  │ LANE 2 (Ingest)   │    │            │   │ LANE 3 (Search)   │   │
  │                    │    │            │   │                    │   │
  │   SR-04            │◄───┘            │   │   SR-06            │◄──┘
  │  (storage adapter) │                 │   │  (BM25-only        │
  │         │          │                 │   │   adapter)          │
  │         ▼          │                 │   │         │          │
  │   SR-05            │◄────────────────┘   │         ▼          │
  │  (ingestion        │                     │   SR-07            │
  │   consumer)        │                     │  (tool             │
  │                    │                     │   consolidation)   │
  └────────┬───────────┘                     └─────────┬──────────┘
           │                                           │
           │                           ┌───────────────┘
           │                           ▼
           │               ┌───────────────────┐
           │               │ LANE 4 (Agent)     │
           │               │                    │
           │               │   SR-08            │
           │               │  (single agent)    │
           │               │         │          │
           │               │         ▼          │
           └───────────────┼──► SR-09           │
                           │  (config module    │
                           │   rewire)          │
                           └─────────┬──────────┘
                                     │
                                     ▼
                           ┌───────────────────┐
                           │ LANE 5 (Cleanup)   │
                           │                    │
                           │   SR-10            │
                           │  (dead code,       │
                           │   deps, README)    │
                           └────────────────────┘
```

---

## Parallel Execution Plan

### Phase 1 — All three can start immediately (no dependencies)

| Ticket | Work | Est. Time |
|--------|------|-----------|
| **SR-01** | Remove `EmbeddingPort`, `ParentChunkData`, `ChildChunkData`, update `SearchPort`, `SearchResult` | 1–2 hr |
| **SR-02** | Enhance `RecursiveTextChunker` with heading/page-break awareness | 1–2 hr |
| **SR-03** | Simplify `FileChunkProperties`, `ensureFileChunksCollection` (drop `chunkType`, `summary`, `parentChunkIndex`) | 1 hr |

### Phase 2 — Two parallel lanes

**Lane 2 (Ingestion):**

| Ticket | Work | Est. Time |
|--------|------|-----------|
| **SR-04** | Create `WeaviateStorageAdapter` for plain chunk inserts without vectors, replacing `VoyageEmbeddingAdapter` for writes | 1–2 hr |
| **SR-05** | Rewrite `ingestion.consumer.ts`: extract → chunk → store. Delete `semantic-chunker.tool.ts`, `chunk-summarizer.tool.ts` | 2–3 hr |

**Lane 3 (Search):**

| Ticket | Work | Est. Time |
|--------|------|-----------|
| **SR-06** | Rewrite `WeaviateAdapter` to BM25-only, remove Voyage dependency from search. Update `SearchPort`. | 1–2 hr |
| **SR-07** | Merge `hybridSearchTool` + `keywordSearchTool` → `searchFilesTool`. Remove `summarizeDocumentTool`, `compareFilesTool`, `evaluateCitationConfidenceTool`. Simplify `getFileContentTool`. | 2–3 hr |

### Phase 3 — Agent rewrite

| Ticket | Work | Est. Time |
|--------|------|-----------|
| **SR-08** | Replace 5 sub-agents + supervisor with single agent. Remove all agent configs except one. | 2–3 hr |

### Phase 4 — Wiring + Cleanup

| Ticket | Work | Est. Time |
|--------|------|-----------|
| **SR-09** | Update `AgentConfigModule`: remove Voyage provider, unused model map entries, dead tool setters | 1–2 hr |
| **SR-10** | Remove unused files, clean package.json (Voyage SDK), update env template, update README | 1–2 hr |

---

## What We Keep

| Component | Why |
|-----------|-----|
| PDF text extraction via Haiku | No free alternative for reliable PDF → text |
| Weaviate as storage + BM25 engine | Already deployed, native BM25 support |
| `RecursiveTextChunker` (enhanced) | Deterministic, fast, no LLM cost |
| Kafka event pipeline | Decoupling is still useful |
| gRPC streaming to backend | Proven, works well |
| VoltAgent framework | Single agent still uses it |
| `getFileContent` concept | Needed for full-file reads (simplified) |

## What We Remove

| Component | Files Deleted |
|-----------|---------------|
| Voyage SDK + embedding | `voyage-embedding.adapter.ts`, `embedding.port.ts` |
| Semantic boundary detection | `semantic-chunker.tool.ts` |
| Chunk summarization | `chunk-summarizer.tool.ts` |
| Fake tools | `summarize-document.tool.ts`, `compare-files.tool.ts`, `evaluate-citation-confidence.tool.ts` |
| Legacy embedding tools | `embed-and-store.tool.ts`, `chunk-text.tool.ts` |
| Sub-agent configs | `search.agent.ts`, `analysis.agent.ts`, `summary.agent.ts`, `citation.agent.ts`, `ingestion.agent.ts` |
| Supervisor config | `supervisor.agent.ts` (replaced by single agent) |

## What We Modify

| Component | Change |
|-----------|--------|
| `libs/core/src/types/file.types.ts` | Remove `ParentChunkData`, `ChildChunkData` |
| `libs/core/src/types/agent.types.ts` | Remove `EmbeddingResult`, `SummaryResult`, `ComparisonResult` |
| `libs/core/src/ports/search.port.ts` | Single `search()` method, remove `hybridSearch` |
| `libs/weaviate/src/collections/file-chunks.collection.ts` | Flat schema, no `chunkType`/`summary`/`parentChunkIndex` |
| `apps/agent/src/adapters/weaviate.adapter.ts` | BM25-only, no Voyage dependency |
| `apps/agent/src/consumers/ingestion.consumer.ts` | Strip to extract → chunk → store |
| `apps/agent/src/consumers/chat.consumer.ts` | Point to single agent |
| `apps/agent/src/config/agent-config.module.ts` | Simplified providers, single agent factory |

---

## Risk & Rollback

- **Data migration**: Existing Weaviate data must be wiped and re-ingested (schema change). This is acceptable since files are stored in local FS and can be re-processed.
- **Feature parity**: Cross-file semantic search without keyword overlap will degrade. This is an accepted trade-off — BM25 handles the vast majority of practical queries.
- **Rollback**: If BM25 proves insufficient, embeddings can be re-added later with a cleaner implementation (embed raw text directly, skip summarization step).

---

## Success Criteria

- [ ] `pnpm exec nx build agent` compiles with zero errors
- [ ] File upload → ingestion completes with zero LLM calls for TXT/MD/JSON, one for PDF
- [ ] Chat query runs through single agent with `searchFiles` + `readFile` tools
- [ ] `voyageai` package removed from `package.json`
- [ ] No references to `VoyageEmbeddingAdapter`, `hybridSearch` vector path, or any removed tools
- [ ] Weaviate collection has flat schema (no `chunkType`, `summary`, `parentChunkIndex`)
- [ ] Ingestion latency reduced by >50% for non-PDF files
