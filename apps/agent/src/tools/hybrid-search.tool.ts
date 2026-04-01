import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchPort } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

export const hybridSearchTool = createTool({
  name: 'hybridSearch',
  description:
    'Search uploaded documents using hybrid search (vector + keyword)',
  parameters: z.object({
    query: z.string().describe('Natural language search query'),
    tenantId: z.string().describe('Tenant identifier'),
    limit: z.number().min(1).max(50).default(10).describe('Max results'),
    alpha: z
      .number()
      .min(0)
      .max(1)
      .default(0.75)
      .describe('Balance between vector (1) and keyword (0) search'),
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
      const results = await searchAdapter.hybridSearch(
        input.query,
        input.tenantId,
        input.limit,
        input.alpha,
      );
      return { results, query: input.query };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Hybrid search failed for query "${input.query}": ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
