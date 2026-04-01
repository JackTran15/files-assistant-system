# [Done] - IV2-01: Update Shared Types & Database Migration

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 3                              |
| **Priority**  | P0 — Blocker for all other IV2 tickets |
| **Epic**      | Ingestion V2                   |
| **Depends on**| —                              |
| **Blocks**    | IV2-02, IV2-03, IV2-04, IV2-05, IV2-06, IV2-07, IV2-08 |

---

## Description

Update the `FileType` and `FileStatus` enums in the shared `@files-assistant/core` library to reflect the new allowed file types (PDF, TXT, JSON, MARKDOWN) and granular processing statuses (EXTRACTING, EXTRACTED, EMBEDDING). Add `parsedText` and `extractionMethod` columns to the `files` table. Create a TypeORM migration to alter the Postgres enums and add the new columns.

---

## Acceptance Criteria

- [ ] `FileType` enum contains exactly: `PDF`, `TXT`, `JSON`, `MARKDOWN` (DOCX removed)
- [ ] `FileStatus` enum contains: `PENDING`, `PROCESSING`, `EXTRACTING`, `EXTRACTED`, `EMBEDDING`, `READY`, `FAILED`
- [ ] `FileMetadata` interface updated with optional `parsedText`, `extractionMethod` fields
- [ ] `FileEntity` has `parsedText` (text, nullable) and `extractionMethod` (varchar(20), nullable) columns
- [ ] New TypeORM migration adds enum values and columns, with working `up()` and `down()`
- [ ] Existing migration is NOT modified (new migration only)
- [ ] `pnpm exec nx build core` compiles with zero errors
- [ ] `pnpm exec nx build backend` compiles with zero errors

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/core/src/types/file.types.ts` | Update `FileType` enum (remove DOCX, add JSON, MARKDOWN). Update `FileStatus` enum (add EXTRACTING, EXTRACTED, EMBEDDING). Add `parsedText?` and `extractionMethod?` to `FileMetadata`. |
| `apps/backend/src/modules/files/entities/file.entity.ts` | Add `parsedText` and `extractionMethod` columns with TypeORM decorators |
| `apps/backend/src/migrations/` (NEW file) | New migration: `1711929700000-IngestionV2Enums.ts` |

---

## Implementation Notes

### Enum Updates (`libs/core/src/types/file.types.ts`)

```typescript
export enum FileType {
  PDF = 'pdf',
  TXT = 'txt',
  JSON = 'json',
  MARKDOWN = 'markdown',
}

export enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  EXTRACTING = 'extracting',
  EXTRACTED = 'extracted',
  EMBEDDING = 'embedding',
  READY = 'ready',
  FAILED = 'failed',
}
```

### Migration SQL

```sql
-- Add new enum values (Postgres requires ALTER TYPE ... ADD VALUE)
ALTER TYPE "file_status_enum" ADD VALUE IF NOT EXISTS 'extracting' AFTER 'processing';
ALTER TYPE "file_status_enum" ADD VALUE IF NOT EXISTS 'extracted' AFTER 'extracting';
ALTER TYPE "file_status_enum" ADD VALUE IF NOT EXISTS 'embedding' AFTER 'extracted';

-- Update file_type_enum: add new values, then migrate existing data
ALTER TYPE "file_type_enum" ADD VALUE IF NOT EXISTS 'json';
ALTER TYPE "file_type_enum" ADD VALUE IF NOT EXISTS 'markdown';

-- Add new columns
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "parsedText" text;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "extractionMethod" varchar(20);
```

> Note: Postgres does not support removing enum values directly. The `docx` value stays in the enum but is no longer used by application code. Document this in the migration comment.

---

## Test Plan

### Unit Tests (`libs/core/src/types/file.types.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | `FileType` has exactly 4 values | `Object.values(FileType)` equals `['pdf', 'txt', 'json', 'markdown']` |
| 2 | `FileStatus` has exactly 7 values | `Object.values(FileStatus)` includes all 7 statuses |
| 3 | Removed DOCX not present | `FileType['DOCX']` is `undefined` |

### Integration Tests (`apps/backend/src/migrations/`)

| # | Test | Assert |
|---|------|--------|
| 1 | Migration `up()` runs without error | Execute migration against test DB, no SQL errors |
| 2 | New columns exist after migration | Query `information_schema.columns` for `parsedText`, `extractionMethod` on `files` table |
| 3 | New enum values exist | Query `pg_enum` for `extracting`, `extracted`, `embedding` in `file_status_enum` |
| 4 | Migration `down()` removes columns | Execute `down()`, verify columns removed |
| 5 | Existing data survives migration | Insert a file with `status='processing'` before migration, verify it still exists after |
