import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchPort, SearchResult } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

const MAX_CHUNK_CHARS = parseInt(
  process.env['MAX_SEARCH_CHUNK_CHARS'] || '1200',
  10,
);

let searchAdapter: SearchPort | null = null;

export function setSearchAdapter(adapter: SearchPort): void {
  searchAdapter = adapter;
}

function truncateResults(results: SearchResult[]) {
  return results.map((r) => ({
    ...r,
    content:
      r.content.length > MAX_CHUNK_CHARS
        ? r.content.slice(0, MAX_CHUNK_CHARS) + '…'
        : r.content,
  }));
}

export const searchFilesTool = createTool({
  name: 'searchFiles',
  description:
    'Search uploaded documents by keyword using BM25. Returns matching text chunks with scores.',
  parameters: z.object({
    query: z
      .string()
      .describe('Search query — keywords, phrases, or questions'),
    tenantId: z.string().describe('Tenant identifier'),
    limit: z.number().min(1).max(20).default(10).describe('Max results'),
    fileIds: z
      .array(z.string())
      .optional()
      .describe('Optional: scope search to specific files'),
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
      const results = await searchAdapter.search(
        input.query,
        input.tenantId,
        input.limit,
        input.fileIds,
      );
      return {
        results: truncateResults(results),
        query: input.query,
      };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Search failed for query "${input.query}": ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
