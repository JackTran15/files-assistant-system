# [Done] IV2-04: Agent — Hybrid Text Extraction (Haiku + Raw)

| Field         | Value                          |
|---------------|--------------------------------|
| **Points**    | 5                              |
| **Priority**  | P0 — Core extraction logic     |
| **Epic**      | Ingestion V2                   |
| **Depends on**| IV2-01                         |
| **Blocks**    | IV2-05, IV2-09                 |

---

## Description

Implement a hybrid text extraction strategy in the agent service. PDF files are sent to Claude Haiku via Anthropic's native PDF support for intelligent extraction (handles tables, complex layouts, OCR). TXT, MD, and JSON files are read as raw UTF-8 text. Replace the current `ExtractorRegistry`-based approach in the `extractText` tool.

---

## Acceptance Criteria

- [ ] PDF files are extracted via Claude Haiku API call using the `document` content block
- [ ] TXT files are read as raw UTF-8
- [ ] MD files are read as raw UTF-8
- [ ] JSON files are read as raw UTF-8
- [ ] Extraction returns `{ text, method, characterCount }` where `method` is `'haiku'` or `'raw'`
- [ ] Haiku extraction uses the model from `ANTHROPIC_HAIKU_MODEL` env var
- [ ] Empty text after extraction throws `AgentProcessingError` with `stage: 'extraction'`
- [ ] Haiku API failure (rate limit, timeout) throws `AgentProcessingError` with `stage: 'extraction'` and `retryable: true`
- [ ] File read failure (missing file, permission error) throws `AgentProcessingError` with `stage: 'extraction'`
- [ ] Large PDFs (>100 pages) are handled without crash (either batched or error with clear message)
- [ ] `@anthropic-ai/sdk` is used (not `@ai-sdk/anthropic`) for native PDF document block support
- [ ] `pnpm exec nx build agent` compiles with zero errors

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/tools/extract-text.tool.ts` | Rewrite: route by MIME type, call Haiku for PDF, raw read for others |
| `apps/agent/src/config/agent-config.schema.ts` | Add `ANTHROPIC_HAIKU_MODEL` to Zod schema |
| `apps/agent/src/config/agent-config.module.ts` | Provide Anthropic client instance for Haiku |
| `package.json` | Verify `@anthropic-ai/sdk` is a dependency (add if missing) |

---

## Implementation Notes

### Haiku PDF Extraction

```typescript
import Anthropic from '@anthropic-ai/sdk';

async extractPdfWithHaiku(fileBuffer: Buffer, fileName: string): Promise<string> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: this.config.get('ANTHROPIC_HAIKU_MODEL', 'claude-3-5-haiku-20241022'),
    max_tokens: 16384,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: 'Extract all text content from this document. Preserve the structure: headings, paragraphs, lists, and tables. For tables, use markdown table format. Do not summarize or interpret — extract verbatim.',
        },
      ],
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
    throw new AgentProcessingError('PDF extraction returned empty text', 'extraction', false);
  }

  return textBlock.text;
}
```

### Error Handling

- **Rate limit (429)**: Catch and wrap as `AgentProcessingError('Haiku rate limited', 'extraction', true)`
- **Timeout**: Use `timeout` option on Anthropic client (30s default)
- **File not found**: Catch ENOENT, wrap as `AgentProcessingError('File not found at storage path', 'extraction', false)`
- **Empty text**: After extraction, check `text.trim().length === 0`, throw non-retryable error

### Large PDF Handling

Anthropic supports up to ~100 pages per request. For now, if a PDF exceeds this:
- Log a warning
- Attempt the full send (API will return an error if too large)
- Catch the specific error and produce `file.failed` with a clear message about size limits

Future enhancement: page-by-page batching (out of scope for this ticket).

---

## Test Plan

### Unit Tests (`apps/agent/src/tools/extract-text.tool.spec.ts`)

| # | Test | Assert |
|---|------|--------|
| 1 | Routes PDF MIME type to Haiku extraction | `extractPdfWithHaiku` called when `mimeType === 'application/pdf'` |
| 2 | Routes `text/plain` to raw extraction | `fs.readFile` called with `'utf-8'` encoding |
| 3 | Routes `text/markdown` to raw extraction | `fs.readFile` called with `'utf-8'` |
| 4 | Routes `application/json` to raw extraction | `fs.readFile` called with `'utf-8'` |
| 5 | Haiku receives correct document block | Mock Anthropic SDK, verify `messages[0].content[0].type === 'document'` and `source.media_type === 'application/pdf'` |
| 6 | Haiku prompt asks for verbatim extraction | Verify prompt contains "Do not summarize or interpret" |
| 7 | Returns `method: 'haiku'` for PDF | Check return value |
| 8 | Returns `method: 'raw'` for TXT/MD/JSON | Check return value |
| 9 | Returns correct `characterCount` | `text.length` matches |
| 10 | Empty Haiku response throws `AgentProcessingError` | Mock empty response, verify error with `stage: 'extraction'` |
| 11 | Haiku API 429 throws retryable error | Mock 429 response, verify `retryable: true` |
| 12 | Missing file throws non-retryable error | Mock ENOENT, verify `retryable: false` |
| 13 | Raw extraction of UTF-8 file preserves content | Read a test fixture, compare output |
| 14 | Uses model from config | Verify Anthropic `create` called with `model` from config service |
