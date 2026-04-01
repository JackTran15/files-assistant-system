# [Done] - PG-04: Agent Defensive Logging

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Points**    | 1                                          |
| **Priority**  | P3 — Observability, not blocking           |
| **Epic**      | Processing Guardrails                      |
| **Depends on**| PG-02                                      |
| **Blocks**    | —                                          |

---

## Description

Add defensive logging in the agent's chat consumer so that when `selectedFileIds` are provided but a search tool returns zero results for one or more of them, a warning is logged. This helps surface issues in debugging without coupling the agent to the backend's database.

With PG-02 in place, the backend validates fileIds before publishing `chat.request`, so the agent can trust that incoming fileIds are `READY`. This logging is a safety net for edge cases (race conditions, manual Kafka publishes, etc.).

---

## Acceptance Criteria

- [ ] When `selectedFileIds` is provided and a search returns zero results, a warning is logged with the fileIds
- [ ] Normal operation (results found) does not log warnings
- [ ] No new database queries or external calls added to the agent

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/consumers/chat.consumer.ts` | Add warning log when selectedFileIds are present but search yields no results |

---

## Implementation Notes

The chat consumer builds a prompt and runs the supervisor agent. The logging should be added around the point where `selectedFileIds` are passed to the agent context, warning if the agent completes with no tool results for any of the provided fileIds.

Since the supervisor runs tools autonomously, a practical approach is to log a warning before handing off when fileIds are present:

```typescript
if (selectedFileIds?.length) {
  this.logger.log(
    `Chat request includes ${selectedFileIds.length} file(s): [${selectedFileIds.join(', ')}]`,
  );
}
```

This provides traceability without adding complexity. Deeper per-tool result tracking would require changes to the supervisor agent and is out of scope.

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Chat request with fileIds | Log message includes file count and IDs |
| 2 | Chat request without fileIds | No file-related log message |
