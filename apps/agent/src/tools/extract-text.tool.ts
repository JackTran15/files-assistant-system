import { createTool } from '@voltagent/core';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import { ExtractorRegistry, AgentProcessingError } from '@files-assistant/core';

const registry = new ExtractorRegistry();

export const extractTextTool = createTool({
  name: 'extractText',
  description: 'Extract text content from a file (PDF, DOCX, or plain text)',
  parameters: z.object({
    fileId: z.string().describe('File ID to extract text from'),
    storagePath: z.string().describe('Path to the stored file'),
    mimeType: z.string().describe('MIME type of the file'),
  }),
  execute: async (input) => {
    try {
      const extractor = registry.getExtractor(input.mimeType);
      if (!extractor) {
        throw new AgentProcessingError(
          `No extractor available for MIME type: ${input.mimeType}`,
          'extraction',
          false,
        );
      }

      const buffer = await fs.readFile(input.storagePath);
      const result = await extractor.extract(buffer);

      return {
        fileId: input.fileId,
        text: result.text,
        pageCount: result.pageCount ?? 0,
      };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to extract text from file ${input.fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'extraction',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
