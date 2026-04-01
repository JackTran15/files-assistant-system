import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchPort } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

export const keywordSearchTool = createTool({
  name: 'keywordSearch',
  description: 'Search documents by exact keywords or filenames using BM25',
  parameters: z.object({
    query: z.string().describe('Exact keyword or filename to search'),
    tenantId: z.string().describe('Tenant identifier'),
    limit: z.number().min(1).max(50).default(10).describe('Max results'),
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
        input.query,
        input.tenantId,
        input.limit,
      );
      return { results, query: input.query };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Keyword search failed for query "${input.query}": ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
