import { createTool } from '@voltagent/core';
import { z } from 'zod';

const DETAIL_CHAR_LIMITS: Record<string, number> = {
  brief: 500,
  detailed: 2000,
  comprehensive: 5000,
};

function extractKeyTopics(text: string, maxTopics = 5): string[] {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wordFreq = new Map<string, number>();
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'out',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'because',
    'if',
    'when',
    'that',
    'this',
    'these',
    'those',
    'it',
    'its',
    'they',
    'them',
    'their',
    'we',
    'our',
    'you',
    'your',
    'he',
    'she',
    'him',
    'her',
    'his',
    'my',
    'i',
    'me',
    'which',
    'who',
    'whom',
    'what',
    'where',
    'how',
    'all',
    'about',
  ]);

  for (const sentence of sentences) {
    const words = sentence.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 3 && !stopWords.has(cleaned)) {
        wordFreq.set(cleaned, (wordFreq.get(cleaned) ?? 0) + 1);
      }
    }
  }

  return [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([word]) => word);
}

export const summarizeDocumentTool = createTool({
  name: 'summarizeDocument',
  description: 'Generate a summary of a document at the specified detail level',
  parameters: z.object({
    fileId: z.string().describe('File ID to summarize'),
    text: z.string().describe('Document text content to summarize'),
    detailLevel: z
      .enum(['brief', 'detailed', 'comprehensive'])
      .default('detailed')
      .describe('Level of detail'),
  }),
  execute: async (input) => {
    const maxLen = DETAIL_CHAR_LIMITS[input.detailLevel] ?? 2000;
    const words = input.text.split(/\s+/).filter(Boolean);
    const keyTopics = extractKeyTopics(input.text);
    const summary =
      input.text.length <= maxLen
        ? input.text
        : input.text.slice(0, maxLen).replace(/\s\S*$/, '…');

    return {
      fileId: input.fileId,
      summary,
      wordCount: words.length,
      keyTopics,
    };
  },
});
