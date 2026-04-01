import { ChunkWithOffset } from '../types/agent.types';
import { STRUCTURAL_SEPARATORS } from './chunker.interface';

const HEADING_PATTERNS: RegExp[] = [
  /^#{1,6}\s+.+$/gm,
  /^(?:Section|Chapter|Part)\s+\d.*/gim,
  /^\d+\.\s+[A-Z].*/gm,
];

/**
 * Find the nearest heading preceding a given offset in the full text.
 * Returns the matched heading line or undefined if none found.
 */
function findNearestHeading(
  fullText: string,
  offset: number,
): string | undefined {
  let closest: { text: string; index: number } | undefined;

  for (const pattern of HEADING_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(fullText)) !== null) {
      if (match.index >= offset) break;
      if (!closest || match.index > closest.index) {
        closest = { text: match[0].replace(/^#+\s+/, '').trim(), index: match.index };
      }
    }
  }

  return closest?.text;
}

/**
 * Build contextual embedding input strings by prepending file name and
 * nearest section heading to each chunk. The enriched strings are only
 * used as embedding model input — stored content stays unchanged.
 */
export function buildContextualTexts(
  fullText: string,
  chunkOffsets: ChunkWithOffset[],
  fileName: string,
): string[] {
  return chunkOffsets.map((chunk) => {
    const heading = findNearestHeading(fullText, chunk.startOffset);
    const parts = [`File: ${fileName}`];
    if (heading) {
      parts.push(`Section: ${heading}`);
    }
    parts.push('', chunk.content);
    return parts.join('\n');
  });
}
