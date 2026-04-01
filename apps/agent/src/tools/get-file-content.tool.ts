import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchPort } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

export const getFileContentTool = createTool({
  name: 'getFileContent',
  description: 'Retrieve the full text content of an uploaded file',
  parameters: z.object({
    fileId: z.string().describe('File ID to retrieve content for'),
    tenantId: z.string().describe('Tenant identifier'),
  }),
  execute: async (input) => {
    if (!searchAdapter) {
      throw new AgentProcessingError(
        'Search adapter not configured. Call setSearchAdapter() during initialization.',
        'search',
        false,
      );
    }

    try {
      const results = await searchAdapter.keywordSearch(
        input.fileId,
        input.tenantId,
        1000,
      );

      const fileChunks = results
        .filter((r) => r.fileId === input.fileId)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      const content = fileChunks.map((c) => c.content).join('');

      return { fileId: input.fileId, content };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to retrieve content for file ${input.fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
