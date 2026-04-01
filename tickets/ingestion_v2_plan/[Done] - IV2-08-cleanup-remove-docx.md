# [Done] - IV2-08: Cleanup — Remove DOCX Support & Update Dependencies

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 1                              |
| **Priority**  | P2 — Cleanup after main tickets |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01, IV2-03, IV2-04         |
| **Blocks**    | —                              |

---

## Description

Remove all DOCX-related code from the codebase now that the allowed file types are limited to PDF, TXT, MD, and JSON. This includes the `DocxExtractor` class, its registration in `ExtractorRegistry`, the export from `@files-assistant/core`, and the `mammoth` dependency if present.

---

## Acceptance Criteria

- [ ] `DocxExtractor` class file deleted
- [ ] `ExtractorRegistry` no longer imports or registers `DocxExtractor`
- [ ] `libs/core/src/index.ts` no longer exports `docx.extractor`
- [ ] `mammoth` removed from `package.json` (if present)
- [ ] No remaining references to `docx` or `mammoth` in application code (DOCX value may remain in Postgres enum — see IV2-01 notes)
- [ ] `pnpm exec nx build core` passes
- [ ] `pnpm exec nx build agent` passes
- [ ] `pnpm exec nx build backend` passes

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/core/src/extraction/docx.extractor.ts` | DELETE |
| `libs/core/src/extraction/extractor.registry.ts` | Remove `DocxExtractor` import and registration |
| `libs/core/src/index.ts` | Remove `export * from './extraction/docx.extractor'` |
| `package.json` | Remove `mammoth` dependency if present |

---

## Implementation Notes

### ExtractorRegistry After Cleanup

```typescript
import { TextExtractor } from './extractor.interface';
import { PdfExtractor } from './pdf.extractor';
import { PlainTextExtractor } from './plaintext.extractor';

export class ExtractorRegistry {
  private extractors: TextExtractor[] = [];

  constructor() {
    this.extractors = [
      new PdfExtractor(),
      new PlainTextExtractor(),
    ];
  }
  // ... rest unchanged
}
```

> Note: `PdfExtractor` is kept for backward compatibility and potential non-Haiku fallback scenarios, even though IV2-04 introduces Haiku extraction. The `PlainTextExtractor` covers TXT, MD, and JSON.

---

## Test Plan

### Build Verification (no unit tests needed — this is a deletion ticket)

| # | Test | Assert |
|---|------|--------|
| 1 | `pnpm exec nx build core` | Zero errors, zero DOCX references in output |
| 2 | `pnpm exec nx build agent` | Zero errors |
| 3 | `pnpm exec nx build backend` | Zero errors |
| 4 | No DOCX imports remain | `rg 'docx' --type ts apps/ libs/` returns zero application code hits (only migration enum value is acceptable) |
| 5 | No mammoth imports remain | `rg 'mammoth' apps/ libs/` returns zero hits |
