# [Done] - PG-03: UI Delete Guard + Store Guard

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Points**    | 2                                          |
| **Priority**  | P2 — UX improvement, backend is the safety net |
| **Epic**      | Processing Guardrails                      |
| **Depends on**| PG-01                                      |
| **Blocks**    | —                                          |

---

## Description

Disable the delete button for files that are in active processing states so the user doesn't trigger a 409 from the backend guard (PG-01). Also add a client-side guard in the Zustand store's `removeFile` action as defense-in-depth.

The file selection checkbox is already disabled for non-ready files, so no chat-side UI changes are needed.

---

## Acceptance Criteria

- [ ] Delete (trash) button is disabled when file status is `processing`
- [ ] Delete button is enabled when file status is `ready`, `failed`, or `pending`
- [ ] Disabled delete button has reduced opacity and `cursor-not-allowed`
- [ ] Tooltip on disabled delete button says "Cannot delete while processing"
- [ ] `removeFile` in store silently returns if the file is in a non-deletable state
- [ ] No regressions: delete still works for `ready` and `failed` files

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/components/file-explorer/file-item.tsx` | Disable trash button for processing files, add tooltip |
| `apps/web/src/stores/files-store.ts` | Guard `removeFile` — check file status before API call |

---

## Implementation Notes

### file-item.tsx

```tsx
const isProcessing = [
  FileStatus.PROCESSING,
  // pending is deletable, so not included here
].includes(file.status);

<Tooltip content={isProcessing ? 'Cannot delete while processing' : `Delete ${file.name}`}>
  <button
    onClick={() => removeFile(file.id)}
    disabled={isProcessing}
    className={cn(
      'p-0.5 rounded transition-opacity',
      isProcessing
        ? 'opacity-30 cursor-not-allowed'
        : 'opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
    )}
    aria-label={`Delete ${file.name}`}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </button>
</Tooltip>
```

Note: the web `FileStatus` enum only has `pending`, `processing`, `ready`, `failed`. The intermediate statuses (`extracting`, `extracted`, `embedding`) are not in the web enum — they are covered under `processing` from the UI's perspective.

### files-store.ts

```typescript
removeFile: async (fileId) => {
  const file = get().files.find((f) => f.id === fileId);
  if (file && file.status === 'processing') return;
  // ... existing delete logic
}
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Render file with status `processing` | Trash button is disabled, has reduced opacity |
| 2 | Render file with status `ready` | Trash button visible on hover, clickable |
| 3 | Render file with status `failed` | Trash button visible on hover, clickable |
| 4 | Hover disabled trash button | Tooltip shows "Cannot delete while processing" |
| 5 | Call `removeFile` for a processing file | No API call made, file remains |
| 6 | Call `removeFile` for a ready file | API call made, file removed from store |
