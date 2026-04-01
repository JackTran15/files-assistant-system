# [Done] - PG-01: Backend Delete Guard + Strict Status Transitions

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Points**    | 3                                          |
| **Priority**  | P1 — Prevents data corruption              |
| **Epic**      | Processing Guardrails                      |
| **Depends on**| —                                          |
| **Blocks**    | PG-03                                      |

---

## Description

Guard the `DELETE /api/files/:id` endpoint so that files in active processing states (`processing`, `extracting`, `extracted`, `embedding`) cannot be deleted. Deleting a processing file orphans Weaviate vectors and crashes the agent ingestion pipeline mid-stream.

Also make the status transition validation in `updateStatus()` strict — throw on invalid transitions instead of logging and proceeding. The current warn-only behavior allows data corruption from race conditions or bugs.

---

## Acceptance Criteria

- [ ] `DELETE /api/files/:id` returns `409 Conflict` when file status is `processing`
- [ ] `DELETE /api/files/:id` returns `409 Conflict` when file status is `extracting`
- [ ] `DELETE /api/files/:id` returns `409 Conflict` when file status is `extracted`
- [ ] `DELETE /api/files/:id` returns `409 Conflict` when file status is `embedding`
- [ ] `DELETE /api/files/:id` returns `204` when file status is `ready`
- [ ] `DELETE /api/files/:id` returns `204` when file status is `failed`
- [ ] `DELETE /api/files/:id` returns `204` when file status is `pending`
- [ ] Response body includes the current file status in the error message
- [ ] `updateStatus()` throws `ConflictException` on invalid transition (e.g., `ready → extracting`)
- [ ] `updateStatus()` still allows valid transitions (e.g., `processing → extracting`)
- [ ] Existing Kafka consumers that call `updateStatus` are not broken by strict enforcement

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/modules/files/files.service.ts` | Add status check in `remove()`, throw `ConflictException` for non-deletable statuses. Change `updateStatus()` to throw on invalid transitions. |

---

## Implementation Notes

### Non-Deletable Statuses

```typescript
const NON_DELETABLE_STATUSES: FileStatus[] = [
  FileStatus.PROCESSING,
  FileStatus.EXTRACTING,
  FileStatus.EXTRACTED,
  FileStatus.EMBEDDING,
];
```

### Guard in `remove()`

```typescript
async remove(id: string): Promise<void> {
  const file = await this.findOne(id);
  if (NON_DELETABLE_STATUSES.includes(file.status)) {
    throw new ConflictException(`Cannot delete file while it is ${file.status}`);
  }
  await this.chunkRepo.delete({ fileId: file.id });
  await this.fileRepo.remove(file);
}
```

### Strict Transitions in `updateStatus()`

Replace the `logger.warn` with a `ConflictException`:

```typescript
const allowed = VALID_TRANSITIONS[file.status] ?? [];
if (!allowed.includes(status)) {
  throw new ConflictException(
    `Invalid status transition for file ${fileId}: ${file.status} → ${status}`,
  );
}
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Delete file with status `processing` | 409 Conflict, file still exists |
| 2 | Delete file with status `extracting` | 409 Conflict |
| 3 | Delete file with status `extracted` | 409 Conflict |
| 4 | Delete file with status `embedding` | 409 Conflict |
| 5 | Delete file with status `ready` | 204, file removed from DB |
| 6 | Delete file with status `failed` | 204, file removed from DB |
| 7 | Delete file with status `pending` | 204, file removed from DB |
| 8 | `updateStatus` with valid transition `processing → extracting` | Status updated |
| 9 | `updateStatus` with invalid transition `ready → extracting` | ConflictException thrown |
| 10 | `updateStatus` with invalid transition `processing → ready` (skipping steps) | ConflictException thrown |
