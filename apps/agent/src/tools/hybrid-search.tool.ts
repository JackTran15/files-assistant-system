import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchPort } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

const MAX_CHUNK_CHARS = parseInt(
  process.env['MAX_SEARCH_CHUNK_CHARS'] || '1200',
  10,
);

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

function truncateResults(
  results: Awaited<ReturnType<SearchPort['hybridSearch']>>,
) {
  return results.map((r) => ({
    ...r,
    content:
      r.content.length > MAX_CHUNK_CHARS
        ? r.content.slice(0, MAX_CHUNK_CHARS) + '…'
        : r.content,
    summary: r.summary,
  }));
}

export const hybridSearchTool = createTool({
  name: 'hybridSearch',
  description:
    'Search uploaded documents using hybrid search (vector + keyword). Returns parent-level summaries and content.',
  parameters: z.object({
    query: z.string().describe('Natural language search query'),
    tenantId: z.string().describe('Tenant identifier'),
    limit: z.number().min(1).max(20).default(5).describe('Max results'),
    alpha: z
      .number()
      .min(0)
      .max(1)
      .default(0.75)
      .describe('Balance between vector (1) and keyword (0) search'),
    fileIds: z
      .array(z.string())
      .optional()
      .describe('Scope results to these file IDs only'),
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
        input.fileIds,
      );
      return { results: truncateResults(results), query: input.query };
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
