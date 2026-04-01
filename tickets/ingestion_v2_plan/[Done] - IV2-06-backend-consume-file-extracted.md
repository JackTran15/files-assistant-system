# [Done] - IV2-06: Backend — Consume `file.extracted` & Persist Parsed Text

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 3                              |
| **Priority**  | P1 — Enables parsed text persistence |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01, IV2-02                 |
| **Blocks**    | IV2-09                         |

---

## Description

Subscribe the backend's Kafka consumer to the new `file.extracted` topic. When received, save the parsed text and extraction method to the file record in Postgres and update the file status to `EXTRACTED`. Emit an SSE event so clients tracking the file see the status change.

---

## Acceptance Criteria

- [ ] `KafkaConsumerService` subscribes to `TOPICS.FILE_EXTRACTED` in addition to existing topics
- [ ] On `file.extracted` message, `parsedText` and `extractionMethod` are saved to the file record
- [ ] File status is updated to `EXTRACTED`
- [ ] SSE stream for the file pushes a status event with `status: 'extracted'`
- [ ] If the file record doesn't exist (race condition or stale event), log a warning and skip (no crash)
- [ ] Large `parsedText` values (up to several MB) are handled without timeout
- [ ] `pnpm exec nx build backend` compiles with zero errors

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/modules/kafka/kafka.consumer.ts` | Add `TOPICS.FILE_EXTRACTED` to subscription. Add case handler that calls `filesService.saveExtractedText()`. |
| `apps/backend/src/modules/files/files.service.ts` | Add `saveExtractedText(fileId, data)` method. Update file record with `parsedText`, `extractionMethod`, status `EXTRACTED`. Emit SSE. |

---

## Implementation Notes

### Kafka Consumer Update

```typescript
// In onModuleInit():
await this.consumer.subscribe({
  topics: [TOPICS.FILE_READY, TOPICS.FILE_FAILED, TOPICS.FILE_EXTRACTED],
  fromBeginning: false,
});

// In handleMessage():
case TOPICS.FILE_EXTRACTED:
  await this.filesService.saveExtractedText(value.fileId, {
    parsedText: value.parsedText,
    extractionMethod: value.extractionMethod,
    characterCount: value.characterCount,
    pageCount: value.pageCount,
  });
  break;
```

### FilesService Method

```typescript
async saveExtractedText(fileId: string, data: {
  parsedText: string;
  extractionMethod: 'haiku' | 'raw';
  characterCount: number;
  pageCount?: number;
}): Promise<void> {
  const result = await this.fileRepo.update(fileId, {
    parsedText: data.parsedText,
    extractionMethod: data.extractionMethod,
    status: FileStatus.EXTRACTED,
  });

  if (result.affected === 0) {
    this.logger.warn(`saveExtractedText: file ${fileId} not found, skipping`);
    return;
  }

  this.emitStatusEvent(fileId, FileStatus.EXTRACTED);
}

private emitStatusEvent(fileId: string, status: FileStatus): void {
  const subject = this.fileStatusStreams.get(fileId);
  if (subject) {
    subject.next({ fileId, status });
  }
}
```

### Ordering Consideration

`file.extracted` and `file.ready` may arrive close together (agent fires-and-continues). The backend consumer processes messages sequentially within a partition. Since both events use `fileId` as the Kafka message key, they will be in the same partition, guaranteeing order: `file.extracted` arrives before `file.ready`.

---

## Test Plan

### Unit Tests (`apps/backend/src/modules/kafka/kafka.consumer.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | Routes `file.extracted` topic to `saveExtractedText` | Mock `filesService.saveExtractedText`, verify called with correct args |
| 2 | Passes all fields from message value | Verify `parsedText`, `extractionMethod`, `characterCount`, `pageCount` forwarded |
| 3 | Handles null message value gracefully | No error thrown when `message.value` is null |
| 4 | Does not interfere with `file.ready` handling | Send `file.ready` message, verify `updateStatus` still called correctly |

### Unit Tests (`apps/backend/src/modules/files/files.service.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `saveExtractedText` updates file record | Mock `fileRepo.update`, verify called with `parsedText`, `extractionMethod`, `status: EXTRACTED` |
| 2 | Missing file logs warning, does not throw | Mock `fileRepo.update` returning `{ affected: 0 }`, verify `logger.warn` called, no exception |
| 3 | SSE event emitted on successful save | Create Subject for fileId, call `saveExtractedText`, verify subject received event |
| 4 | No SSE error if no subscriber | Call without any SSE subscriber, verify no exception |
| 5 | Large parsedText (1MB) saves successfully | Pass 1MB string, verify `fileRepo.update` called (no truncation) |
