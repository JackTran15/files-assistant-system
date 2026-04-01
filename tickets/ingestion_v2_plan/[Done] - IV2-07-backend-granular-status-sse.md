# [Done] - IV2-07: Backend — Granular Status Transitions & SSE Updates

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 3                              |
| **Priority**  | P1 — Enables full status tracking for clients |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01, IV2-06                 |
| **Blocks**    | IV2-09                         |

---

## Description

Update the backend's `FilesService.updateStatus` and SSE streaming to support the new granular statuses (EXTRACTING, EXTRACTED, EMBEDDING). Ensure SSE pushes an event for every status transition so clients can display real-time progress. Add status transition validation to prevent invalid state changes (e.g., READY → PROCESSING).

---

## Acceptance Criteria

- [ ] `updateStatus` accepts all new `FileStatus` values (EXTRACTING, EXTRACTED, EMBEDDING)
- [ ] SSE stream pushes an event for each status change, not just terminal states
- [ ] SSE Subject completes only on terminal statuses (READY, FAILED) — intermediate statuses keep the stream open
- [ ] Invalid status transitions are logged as warnings (e.g., READY → PROCESSING) but still applied (no hard block)
- [ ] `GET /api/files/:id` returns the current status correctly for all enum values
- [ ] `GET /api/files?status=extracted` filter works with new statuses
- [ ] `FileResponseDto` includes `parsedText` and `extractionMethod` fields (optional, only populated when present)
- [ ] SSE event payload includes `{ fileId, status, timestamp }` for intermediate statuses

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/modules/files/files.service.ts` | Update `updateStatus` to handle all statuses. Add status transition logging. Ensure SSE emits for intermediates. |
| `apps/backend/src/modules/files/dto/file-response.dto.ts` | Add `parsedText?`, `extractionMethod?` fields |
| `apps/backend/src/modules/files/dto/search-files.dto.ts` | Verify `status` filter accepts new enum values |

---

## Implementation Notes

### Valid Status Transitions

```typescript
const VALID_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  [FileStatus.PENDING]:     [FileStatus.PROCESSING],
  [FileStatus.PROCESSING]:  [FileStatus.EXTRACTING, FileStatus.FAILED],
  [FileStatus.EXTRACTING]:  [FileStatus.EXTRACTED, FileStatus.FAILED],
  [FileStatus.EXTRACTED]:   [FileStatus.EMBEDDING, FileStatus.READY, FileStatus.FAILED],
  [FileStatus.EMBEDDING]:   [FileStatus.READY, FileStatus.FAILED],
  [FileStatus.READY]:       [],
  [FileStatus.FAILED]:      [FileStatus.PROCESSING], // allow retry
};
```

Log a warning on invalid transitions but apply anyway (defensive — don't break the pipeline over a race condition). The transition map serves as documentation and monitoring, not enforcement.

### Updated SSE Logic

Currently, `updateStatus` completes the SSE Subject on READY/FAILED. This must be preserved, but intermediate statuses (EXTRACTING, EXTRACTED, EMBEDDING) should push events without completing:

```typescript
const subject = this.fileStatusStreams.get(fileId);
if (subject) {
  subject.next({ fileId, status, timestamp: new Date().toISOString() });

  if (status === FileStatus.READY || status === FileStatus.FAILED) {
    subject.complete();
    this.fileStatusStreams.delete(fileId);
  }
}
```

### FileStatusEvent Update

Add `timestamp` to the existing `FileStatusEvent` interface:

```typescript
export interface FileStatusEvent {
  fileId: string;
  status: string;
  error?: string;
  timestamp?: string;
}
```

---

## Test Plan

### Unit Tests (`apps/backend/src/modules/files/files.service.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `updateStatus` to EXTRACTING updates DB | `fileRepo.update` called with `status: 'extracting'` |
| 2 | `updateStatus` to EXTRACTED updates DB | `fileRepo.update` called with `status: 'extracted'` |
| 3 | `updateStatus` to EMBEDDING updates DB | `fileRepo.update` called with `status: 'embedding'` |
| 4 | SSE emits on EXTRACTING (stream stays open) | Subscribe to stream, update to EXTRACTING, verify event received, verify stream NOT completed |
| 5 | SSE emits on EXTRACTED (stream stays open) | Same as above for EXTRACTED |
| 6 | SSE emits on EMBEDDING (stream stays open) | Same as above for EMBEDDING |
| 7 | SSE completes on READY | Update to READY, verify `complete()` called, Subject removed from map |
| 8 | SSE completes on FAILED | Update to FAILED, verify `complete()` called |
| 9 | Full status progression via SSE | Subscribe, push EXTRACTING → EXTRACTED → EMBEDDING → READY. Verify 4 events received in order, stream completes after READY. |
| 10 | Invalid transition logged but applied | Update READY → PROCESSING, verify `logger.warn` called, DB still updated |
| 11 | `findAll` with `status=extracted` returns filtered results | Query with filter, verify only EXTRACTED files returned |

### Unit Tests (`apps/backend/src/modules/files/dto/file-response.dto.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | DTO includes `parsedText` when present | Serialize entity with `parsedText`, verify in output |
| 2 | DTO omits `parsedText` when null | Serialize entity without `parsedText`, verify not in output |
