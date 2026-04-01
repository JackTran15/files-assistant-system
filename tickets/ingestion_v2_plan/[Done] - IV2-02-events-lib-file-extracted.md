# [Done] - IV2-02: Add FILE_EXTRACTED Topic & Event Schema

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 1                              |
| **Priority**  | P0 — Required by consumer/producer tickets |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01                         |
| **Blocks**    | IV2-05, IV2-06                 |

---

## Description

Add the `file.extracted` Kafka topic constant and `FileExtractedEvent` schema to the shared `@files-assistant/events` library. This event carries the parsed text from the agent to the backend after text extraction completes.

---

## Acceptance Criteria

- [ ] `TOPICS.FILE_EXTRACTED` equals `'file.extracted'`
- [ ] `FileExtractedEvent` interface has all required fields
- [ ] `createFileExtractedEvent` factory produces a valid event with auto-generated `timestamp`
- [ ] All types exported from `libs/events/src/index.ts`
- [ ] `pnpm exec nx build events` compiles with zero errors

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/events/src/lib/topics.ts` | Add `FILE_EXTRACTED: 'file.extracted'` to `TOPICS` |
| `libs/events/src/schemas/file-extracted.event.ts` (NEW) | Create `FileExtractedEvent` interface + `createFileExtractedEvent` factory |
| `libs/events/src/index.ts` | Export new schema |

---

## Implementation Notes

### Event Schema (`file-extracted.event.ts`)

```typescript
export interface FileExtractedEvent {
  fileId: string;
  tenantId: string;
  parsedText: string;
  extractionMethod: 'haiku' | 'raw';
  pageCount?: number;
  characterCount: number;
  timestamp: string;
}

export function createFileExtractedEvent(
  params: Omit<FileExtractedEvent, 'timestamp'>,
): FileExtractedEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
```

---

## Test Plan

### Unit Tests (`libs/events/src/schemas/file-extracted.event.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `TOPICS.FILE_EXTRACTED` is `'file.extracted'` | Strict equality check |
| 2 | `createFileExtractedEvent` returns event with timestamp | Call with valid params, verify `timestamp` is ISO string |
| 3 | Factory preserves all input fields | Call with `fileId`, `tenantId`, `parsedText`, `extractionMethod`, `characterCount`; verify all present in output |
| 4 | Factory handles optional `pageCount` | Call without `pageCount`, verify field is `undefined`; call with it, verify present |
