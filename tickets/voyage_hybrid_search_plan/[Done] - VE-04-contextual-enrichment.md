# [Done] - VE-04: Contextual Enrichment Utility

## Summary
Build heading-aware embedding input strings by prepending file name and nearest section heading to each chunk.

## Files Changed
- `libs/core/src/chunking/contextual-enrichment.ts` (new) -- `buildContextualTexts()` function
- `libs/core/src/index.ts` -- re-export

## Details
- `buildContextualTexts(fullText, chunkOffsets, fileName): string[]`
- For each chunk, scans backward from `startOffset` to find the nearest markdown heading
- Returns enriched strings: `"File: {fileName}\nSection: {heading}\n\n{chunkContent}"`
- If no heading found, just prepends file name
- Enriched strings are only used as embedding input -- stored `content` stays unchanged
