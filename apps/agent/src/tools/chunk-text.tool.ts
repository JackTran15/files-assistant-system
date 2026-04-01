import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { RecursiveTextChunker } from '@files-assistant/core';

const chunker = new RecursiveTextChunker();

export const chunkTextTool = createTool({
  name: 'chunkText',
  description: 'Split text into overlapping chunks for embedding',
  parameters: z.object({
    text: z.string().describe('Text to split into chunks'),
    chunkSize: z
      .number()
      .default(1000)
      .describe('Target chunk size in characters'),
    chunkOverlap: z.number().default(200).describe('Overlap between chunks'),
  }),
  execute: async (input) => {
    return chunker.chunk(input.text, {
      chunkSize: input.chunkSize,
      chunkOverlap: input.chunkOverlap,
    });
  },
});
