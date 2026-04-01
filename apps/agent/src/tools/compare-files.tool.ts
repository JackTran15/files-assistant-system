import { createTool } from '@voltagent/core';
import { z } from 'zod';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length > 2),
  );
}

function getParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const compareFilesTool = createTool({
  name: 'compareFiles',
  description: 'Compare two files and identify similarities and differences',
  parameters: z.object({
    fileIdA: z.string().describe('First file ID'),
    fileIdB: z.string().describe('Second file ID'),
    contentA: z.string().describe('Text content of the first file'),
    contentB: z.string().describe('Text content of the second file'),
  }),
  execute: async (input) => {
    const wordsA = tokenize(input.contentA);
    const wordsB = tokenize(input.contentB);

    const commonWords = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const uniqueToA = new Set([...wordsA].filter((w) => !wordsB.has(w)));
    const uniqueToB = new Set([...wordsB].filter((w) => !wordsA.has(w)));

    const parasA = getParagraphs(input.contentA);
    const parasB = getParagraphs(input.contentB);

    const similarities: string[] = [];
    const differences: string[] = [];

    if (commonWords.size > 0) {
      const topCommon = [...commonWords].slice(0, 20).join(', ');
      similarities.push(`Both documents share key terms: ${topCommon}`);
    }

    if (parasA.length > 0 && parasB.length > 0) {
      similarities.push(
        `Document A has ${parasA.length} paragraphs, Document B has ${parasB.length} paragraphs`,
      );
    }

    const overlapRatio =
      commonWords.size / Math.max(wordsA.size, wordsB.size, 1);
    if (overlapRatio > 0.5) {
      similarities.push(
        `High vocabulary overlap (${(overlapRatio * 100).toFixed(1)}%), suggesting similar subject matter`,
      );
    }

    if (uniqueToA.size > 0) {
      const topUnique = [...uniqueToA].slice(0, 10).join(', ');
      differences.push(`Terms unique to Document A: ${topUnique}`);
    }

    if (uniqueToB.size > 0) {
      const topUnique = [...uniqueToB].slice(0, 10).join(', ');
      differences.push(`Terms unique to Document B: ${topUnique}`);
    }

    const lenDiff = Math.abs(input.contentA.length - input.contentB.length);
    if (lenDiff > 0) {
      const longer =
        input.contentA.length > input.contentB.length
          ? 'Document A'
          : 'Document B';
      differences.push(
        `${longer} is longer by approximately ${lenDiff} characters`,
      );
    }

    const summary = [
      `Compared documents ${input.fileIdA} and ${input.fileIdB}.`,
      `Vocabulary overlap: ${(overlapRatio * 100).toFixed(1)}%.`,
      `Found ${similarities.length} similarities and ${differences.length} differences.`,
    ].join(' ');

    return {
      fileIdA: input.fileIdA,
      fileIdB: input.fileIdB,
      similarities,
      differences,
      summary,
    };
  },
});
