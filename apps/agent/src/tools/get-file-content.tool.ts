import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchResult } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';
import type { WeaviateAdapter } from '../adapters/weaviate.adapter';

const MAX_CONTENT_CHARS = parseInt(
  process.env['MAX_FILE_CONTENT_CHARS'] || '20000',
  10,
);

let weaviateAdapter: WeaviateAdapter | null = null;

export function setSearchAdapter(adapter: WeaviateAdapter): void {
  weaviateAdapter = adapter;
}

function selectRepresentativeChunks(
  chunks: SearchResult[],
  budget: number,
): { content: string; includedChunks: number; totalChunks: number } {
  const totalChars = chunks.reduce((s, c) => s + c.content.length, 0);

  if (totalChars <= budget) {
    return {
      content: chunks.map((c) => c.content).join(''),
      includedChunks: chunks.length,
      totalChunks: chunks.length,
    };
  }

  const selected: SearchResult[] = [];
  let usedChars = 0;

  const step = Math.max(1, Math.floor(chunks.length / Math.ceil(budget / (totalChars / chunks.length))));

  for (let i = 0; i < chunks.length; i += step) {
    const chunk = chunks[i];
    if (usedChars + chunk.content.length > budget) break;
    selected.push(chunk);
    usedChars += chunk.content.length;
  }

  const lastChunk = chunks[chunks.length - 1];
  if (
    selected.length > 0 &&
    selected[selected.length - 1].chunkIndex !== lastChunk.chunkIndex &&
    usedChars + lastChunk.content.length <= budget
  ) {
    selected.push(lastChunk);
    usedChars += lastChunk.content.length;
  }

  const parts: string[] = [];
  let prevIndex = -1;
  for (const chunk of selected) {
    if (prevIndex >= 0 && chunk.chunkIndex > prevIndex + 1) {
      parts.push(`\n[...skipped chunks ${prevIndex + 1}-${chunk.chunkIndex - 1}...]\n`);
    }
    parts.push(chunk.content);
    prevIndex = chunk.chunkIndex;
  }

  return {
    content: parts.join(''),
    includedChunks: selected.length,
    totalChunks: chunks.length,
  };
}

export const getFileContentTool = createTool({
  name: 'getFileContent',
  description:
    'Retrieve text content of an uploaded file via its child chunks. For large files, returns evenly-sampled sections.',
  parameters: z.object({
    fileId: z.string().describe('File ID to retrieve content for'),
    tenantId: z.string().describe('Tenant identifier'),
  }),
  execute: async (input) => {
    if (!weaviateAdapter) {
      throw new AgentProcessingError(
        'Search adapter not configured. Call setSearchAdapter() during initialization.',
        'search',
        false,
      );
    }

    try {
      const childChunks = await weaviateAdapter.getChildChunks(
        input.fileId,
        input.tenantId,
      );

      if (childChunks.length === 0) {
        const parentResults = await weaviateAdapter.keywordSearch(
          input.fileId,
          input.tenantId,
          50,
          [input.fileId],
        );
        const sorted = parentResults
          .filter((r) => r.fileId === input.fileId)
          .sort((a, b) => a.chunkIndex - b.chunkIndex);

        const { content, includedChunks, totalChunks } =
          selectRepresentativeChunks(sorted, MAX_CONTENT_CHARS);

        return { fileId: input.fileId, content, includedChunks, totalChunks, sampled: includedChunks < totalChunks };
      }

      const { content, includedChunks, totalChunks } =
        selectRepresentativeChunks(childChunks, MAX_CONTENT_CHARS);

      return {
        fileId: input.fileId,
        content,
        includedChunks,
        totalChunks,
        sampled: includedChunks < totalChunks,
      };
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
