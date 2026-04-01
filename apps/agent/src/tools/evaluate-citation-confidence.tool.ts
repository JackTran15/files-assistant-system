import { createTool } from '@voltagent/core';
import { z } from 'zod';

export const evaluateCitationConfidenceTool = createTool({
  name: 'evaluateCitationConfidence',
  description:
    'Evaluate citation quality: coverage, validity, source utilization.',
  parameters: z.object({
    citedText: z.string().describe('Full cited response with [N] markers'),
    sourceCount: z.number().describe('Total available source chunks'),
    claimCount: z.number().describe('Number of factual claims'),
  }),
  execute: async ({ citedText, sourceCount, claimCount }) => {
    const matches = citedText.match(/\[(\d+)\]/g) || [];
    const uniqueNums = [
      ...new Set(matches.map((m) => parseInt(m.replace(/[\[\]]/g, '')))),
    ];

    const coverageScore = Math.min(
      uniqueNums.length / Math.max(claimCount, 1),
      1.0,
    );
    const invalidRefs = uniqueNums.filter((n) => n < 1 || n > sourceCount);
    const validityScore =
      1 - invalidRefs.length / Math.max(uniqueNums.length, 1);
    const utilizationScore = Math.min(
      uniqueNums.length / Math.max(sourceCount, 1),
      1.0,
    );
    const overall =
      coverageScore * 0.5 + validityScore * 0.3 + utilizationScore * 0.2;
    const threshold = parseFloat(
      process.env['CITATION_CONFIDENCE_THRESHOLD'] || '0.7',
    );

    const weaknesses: string[] = [];
    if (coverageScore < 0.7)
      weaknesses.push(
        `Low coverage: ${uniqueNums.length}/${claimCount} claims cited`,
      );
    if (invalidRefs.length > 0)
      weaknesses.push(`Invalid refs: ${invalidRefs.join(', ')}`);
    if (utilizationScore < 0.5)
      weaknesses.push(`${sourceCount - uniqueNums.length} sources unused`);

    return {
      confidenceScore: Math.round(overall * 100) / 100,
      coverageScore: Math.round(coverageScore * 100) / 100,
      validityScore: Math.round(validityScore * 100) / 100,
      utilizationScore: Math.round(utilizationScore * 100) / 100,
      weaknesses,
      needsRevision: overall < threshold,
      threshold,
    };
  },
});
