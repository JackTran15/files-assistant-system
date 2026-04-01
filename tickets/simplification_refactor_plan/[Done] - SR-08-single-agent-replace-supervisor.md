# [Done] - SR-08: Single Agent — Replace Supervisor Architecture

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 3                                         |
| **Priority**  | P2 — Agent architecture                   |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| SR-07                                     |
| **Blocks**    | SR-09                                     |
| **Lane**      | Lane 4 (Agent)                            |

---

## Description

Replace the 5 sub-agent + supervisor architecture with a **single agent** running Sonnet. The current setup has a Haiku supervisor routing to SearchAgent (Haiku), AnalysisAgent (Sonnet), SummaryAgent (Sonnet), CitationAgent (Haiku), and IngestionAgent (Haiku) — 6 LLM actors per query, with context duplication via `includeAgentsMemory: true`.

The single agent handles everything: searching, reading files, summarizing, comparing, and citing — all through its system prompt and two tools (`searchFiles`, `readFile`). The LLM is better at all of these tasks than the heuristic tools they replace.

---

## Acceptance Criteria

- [ ] Single `filesAssistantAgent` config replaces `supervisorAgentConfig` + all sub-agent configs
- [ ] Agent uses Sonnet model (configurable via env)
- [ ] Agent has exactly 2 tools: `searchFilesTool` and `readFileTool`
- [ ] System prompt instructs agent to: search when needed, read full files when needed, cite sources naturally, summarize/compare when asked
- [ ] No `subAgents` array
- [ ] No `supervisorConfig`
- [ ] No routing overhead (one LLM call per turn, not 2+)
- [ ] `chat.consumer.ts` injects the single agent
- [ ] Streaming still works via gRPC
- [ ] `pnpm exec nx build agent` compiles

---

## Files to Delete

| File | Reason |
|------|--------|
| `apps/agent/src/agents/search.agent.ts` | Replaced by single agent |
| `apps/agent/src/agents/analysis.agent.ts` | Replaced by single agent |
| `apps/agent/src/agents/summary.agent.ts` | Replaced by single agent |
| `apps/agent/src/agents/citation.agent.ts` | Replaced by single agent |
| `apps/agent/src/agents/ingestion.agent.ts` | Not used at chat time; ingestion is a consumer |
| `apps/agent/src/agents/supervisor.agent.ts` | Replaced by single agent |

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/agent/src/agents/files-assistant.agent.ts` | Single agent configuration |

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/consumers/chat.consumer.ts` | No change needed if `SUPERVISOR_AGENT` token is reused or renamed |

---

## Implementation Notes

### Single Agent Config

```typescript
import { searchFilesTool } from '../tools/search-files.tool';
import { readFileTool } from '../tools/read-file.tool';

export const filesAssistantAgentConfig = {
  name: 'FilesAssistant',
  model: 'default' as const,
  instructions: `You are a file assistant that helps users search, read, analyze, summarize, and compare their uploaded documents.

You have access to two tools:
- searchFiles: Search across documents by keyword. Use when the user asks a question and you need to find relevant content.
- readFile: Read the full content of a specific file. Use when you need to analyze, summarize, or compare a specific document.

Guidelines:
- User messages include [Context] lines with tenantId and optional selectedFileIds. Pass tenantId to all tool calls. When fileIds are present, scope searches to those files.
- When answering questions about file content, cite your sources by mentioning the file name and relevant section.
- For summarization requests, read the file first, then summarize in your own words.
- For comparison requests, read both files, then provide a structured comparison.
- If search results are insufficient, try different keywords or read the full file.
- Be concise but thorough. Include specific details from the documents.`,
  tools: [searchFilesTool, readFileTool],
};
```

### Model Resolution

The single agent uses Sonnet (the more capable model), since it now handles analysis, summarization, and comparison directly — tasks that benefit from stronger reasoning.

```typescript
// In agent-config.module.ts (updated in SR-09):
const model = anthropic(
  process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
);
```

### What Changes in Chat Flow

| Before | After |
|--------|-------|
| Supervisor (Haiku) decides which sub-agent | Single agent (Sonnet) decides which tool to call |
| Sub-agent (Haiku/Sonnet) calls its tools | Same agent calls tools directly |
| Tool output flows to supervisor, then next sub-agent | Tool output stays in same conversation |
| CitationAgent rewrites response with `[N]` markers | Agent naturally cites in its response |
| 2-6 LLM calls per query | 1 LLM call per turn (plus tool roundtrips) |

### Context Window Efficiency

Before: Each sub-agent call carries the supervisor's context + previous sub-agent outputs (`includeAgentsMemory: true`), leading to duplicated content across agents.

After: Single conversation thread. Tool outputs are seen once. No duplication.

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Agent responds to search query using `searchFiles` tool | Tool called, results incorporated in response |
| 2 | Agent responds to "summarize this file" using `readFile` tool | Tool called, summary generated by LLM |
| 3 | Agent responds to "compare file A and B" using `readFile` twice | Both files read, meaningful comparison |
| 4 | Agent includes source citations naturally | File names mentioned in response |
| 5 | Streaming works end-to-end | Chunks received via gRPC |
| 6 | `[Context] tenantId` and `selectedFileIds` passed to tool calls | Tool invocations include correct parameters |
| 7 | No sub-agent configs in codebase | All deleted agent files gone |
| 8 | No `supervisorConfig` in agent creation | Single flat agent |
