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

function collectSourceChunks(results: SearchResult[]) {
  return results.map((r) => ({
    fileId: r.fileId,
    fileName: r.fileName,
    chunkIndex: r.chunkIndex,
    content: r.content,
    score: r.score,
    metadata: r.metadata ?? {},
  }));
}

function scoreChunkSignal(content: string): number {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;

  const alphaNumMatches = normalized.match(/[a-zA-Z0-9]/g);
  const alphaNumCount = alphaNumMatches?.length ?? 0;
  const headingOrRuleOnly = /^(#{1,6}\s+.+|[-*_]{2,})$/m.test(normalized);

  let score = 0;
  if (normalized.length >= 40) score += 2;
  if (alphaNumCount >= 25) score += 2;
  if (/[.?!:;]/.test(normalized)) score += 1;
  if (headingOrRuleOnly) score -= 3;

  return score;
}

function filterLowSignalResults(results: SearchResult[]): SearchResult[] {
  const filtered = results.filter((r) => scoreChunkSignal(r.content) > 0);
  return filtered.length > 0 ? filtered : results;
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
      const rawResults = await searchAdapter.search(
        input.query,
        input.tenantId,
        input.limit,
        input.fileIds,
      );
      const results = filterLowSignalResults(rawResults);
      return {
        results: truncateResults(results),
        query: input.query,
        _sourceChunks: collectSourceChunks(results),
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
