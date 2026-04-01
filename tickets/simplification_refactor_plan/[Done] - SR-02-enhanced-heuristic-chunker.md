# [Done] - SR-02: Enhanced Heuristic Chunker — Heading-Aware Splitting

| Field         | Value                                     |
|---------------|-------------------------------------------|
| **Points**    | 2                                         |
| **Priority**  | P0 — Foundation                           |
| **Epic**      | Agent Simplification Refactor             |
| **Depends on**| —                                         |
| **Blocks**    | SR-05                                     |
| **Lane**      | Lane 1 (Foundation — parallel with SR-01, SR-03) |

---

## Description

Enhance `RecursiveTextChunker` to detect structural boundaries (markdown headings, page breaks, numbered sections) before falling back to generic separators. This replaces the LLM-based `semantic-chunker.tool.ts` which costs a Haiku call per ingestion and is fragile (JSON parsing, phrase matching failures).

The enhanced chunker should produce meaningful sections without any LLM calls — deterministic, instant, and free.

---

## Acceptance Criteria

- [ ] Chunker respects markdown headings (`#`, `##`, `###` etc.) as primary split points
- [ ] Chunker respects page break markers (`\f`, `---`, `***`) as split points
- [ ] Chunker respects numbered section patterns (`1.`, `Section 1`, `Chapter 1`) as split points
- [ ] Falls back to existing double-newline → single-newline → sentence → word splitting
- [ ] Default chunk size increased to `1500` chars (from 1000) for ingestion use case
- [ ] Chunk overlap configurable, default `200` chars
- [ ] Each chunk includes its start/end offsets relative to original text
- [ ] Empty/whitespace-only chunks are filtered out
- [ ] `pnpm exec nx test core` passes
- [ ] `pnpm exec nx build core` compiles

---

## Files to Modify

| File | Change |
|------|--------|
| `libs/core/src/chunking/chunker.interface.ts` | Add `structuralSeparators` to default options |
| `libs/core/src/chunking/recursive-text.chunker.ts` | Add heading/page-break detection before generic splitting |
| `libs/core/src/types/agent.types.ts` | Add `offsets` to `ChunkingResult` |

---

## Implementation Notes

### Enhanced Separator Priority

```typescript
export const STRUCTURAL_SEPARATORS = [
  /^#{1,6}\s/m,         // Markdown headings
  /\f/,                  // Form feed (page break)
  /^-{3,}$/m,           // Horizontal rule ---
  /^\*{3,}$/m,          // Horizontal rule ***
  /^(?:Section|Chapter|Part)\s+\d/im,  // Numbered sections
  /^\d+\.\s+[A-Z]/m,   // Numbered list items starting sections
];

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 1500,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ' ', ''],
};
```

### Splitting Strategy

1. First pass: split on structural separators (headings, page breaks) to get "sections"
2. For each section > `chunkSize`: recursively split using generic separators (existing logic)
3. For each section <= `chunkSize`: keep as-is
4. Apply overlap between adjacent chunks
5. Track offsets for each chunk

### Offset Tracking

Return offsets alongside chunk text so downstream consumers know where each chunk came from:

```typescript
export interface ChunkWithOffset {
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkingResult {
  chunks: string[];
  chunkOffsets: ChunkWithOffset[];
  totalChunks: number;
  averageChunkSize: number;
}
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Markdown doc with `# Heading` splits at headings | Each heading starts a new chunk |
| 2 | Doc with `\f` page breaks splits at page breaks | Chunks align with pages |
| 3 | Doc with `---` horizontal rules splits at rules | Rules are split points |
| 4 | Plain text without structural markers falls back to `\n\n` | Same behavior as before |
| 5 | Section smaller than `chunkSize` kept as single chunk | Not over-split |
| 6 | Section larger than `chunkSize` recursively split | Sub-chunks within budget |
| 7 | Overlap applied between adjacent chunks | Last N chars of chunk N appear at start of chunk N+1 |
| 8 | Offsets track correctly | `text.slice(offset.startOffset, offset.endOffset)` matches chunk content |
| 9 | Empty sections filtered | No empty strings in output |
| 10 | Single-line document returns one chunk | Edge case handled |
