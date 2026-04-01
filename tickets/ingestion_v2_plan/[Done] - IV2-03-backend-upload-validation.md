# [Done] - IV2-03: Backend Upload Validation — File Type Allowlist

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 3                              |
| **Priority**  | P1 — Gateway change, blocks E2E testing |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01                         |
| **Blocks**    | IV2-09                         |

---

## Description

Replace the current Multer `fileFilter` (which only rejects `video/*`) with a strict allowlist that accepts only PDF, TXT, MD, and JSON files. Update the `resolveFileType` helper to map MIME types to the new `FileType` enum values (JSON, MARKDOWN added). Update Swagger documentation to reflect the accepted types.

---

## Acceptance Criteria

- [ ] Upload of `.pdf` returns 202
- [ ] Upload of `.txt` returns 202
- [ ] Upload of `.md` returns 202
- [ ] Upload of `.json` returns 202
- [ ] Upload of `.docx` returns 400 with message "Unsupported file type. Allowed: PDF, TXT, MD, JSON"
- [ ] Upload of `.mp4` returns 400
- [ ] Upload of `.csv` returns 400
- [ ] Upload of `.exe` returns 400
- [ ] `resolveFileType` correctly maps `application/json` → `FileType.JSON`
- [ ] `resolveFileType` correctly maps `text/markdown` → `FileType.MARKDOWN`
- [ ] Swagger docs show accepted file types
- [ ] 50 MB size limit preserved

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/modules/files/files.controller.ts` | Replace `fileFilter` with allowlist. Validate by MIME type + extension fallback. |
| `apps/backend/src/modules/files/files.service.ts` | Update `resolveFileType()` to handle `application/json`, `text/markdown`, `text/x-markdown`. Remove DOCX mapping. |
| `apps/backend/src/modules/files/dto/upload-file.dto.ts` | Verify DTO still valid (no changes expected) |

---

## Implementation Notes

### Allowlist Constants

Define at top of controller (or in a shared constants file):

```typescript
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.json']);
```

Both MIME type and extension are checked because browsers sometimes send incorrect MIME types (e.g., `.md` files sent as `application/octet-stream`).

### Updated `resolveFileType`

```typescript
private resolveFileType(mimeType: string): FileType {
  if (mimeType === 'application/pdf') return FileType.PDF;
  if (mimeType === 'application/json') return FileType.JSON;
  if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') return FileType.MARKDOWN;
  return FileType.TXT;
}
```

---

## Test Plan

### Unit Tests (`apps/backend/src/modules/files/files.controller.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | Accepts `application/pdf` | fileFilter callback called with `null, true` |
| 2 | Accepts `text/plain` | fileFilter callback called with `null, true` |
| 3 | Accepts `text/markdown` | fileFilter callback called with `null, true` |
| 4 | Accepts `text/x-markdown` | fileFilter callback called with `null, true` |
| 5 | Accepts `application/json` | fileFilter callback called with `null, true` |
| 6 | Accepts `.md` with `application/octet-stream` (extension fallback) | fileFilter allows based on extension |
| 7 | Rejects `video/mp4` | fileFilter callback called with `BadRequestException` |
| 8 | Rejects `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Rejected with error message |
| 9 | Rejects `text/csv` | Rejected with error message |
| 10 | Error message contains allowed types | Message includes "PDF, TXT, MD, JSON" |

### Unit Tests (`apps/backend/src/modules/files/files.service.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `resolveFileType('application/pdf')` returns `PDF` | Enum match |
| 2 | `resolveFileType('application/json')` returns `JSON` | Enum match |
| 3 | `resolveFileType('text/markdown')` returns `MARKDOWN` | Enum match |
| 4 | `resolveFileType('text/x-markdown')` returns `MARKDOWN` | Enum match |
| 5 | `resolveFileType('text/plain')` returns `TXT` | Enum match (default fallback) |

### Integration Test (HTTP)

| # | Test | Assert |
|---|------|--------|
| 1 | `POST /api/files/upload` with PDF file | 202 response, file saved to DB |
| 2 | `POST /api/files/upload` with DOCX file | 400 response, no DB record created |
| 3 | `POST /api/files/upload` with 60MB PDF | 413 Payload Too Large |
