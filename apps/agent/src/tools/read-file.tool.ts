import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchResult } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

const MAX_CONTENT_CHARS = parseInt(
  process.env['MAX_FILE_CONTENT_CHARS'] || '20000',
  10,
);

type FileChunksReader = {
  getFileChunks(fileId: string, tenantId: string): Promise<SearchResult[]>;
};

let fileChunksReader: FileChunksReader | null = null;

export function setWeaviateAdapter(adapter: FileChunksReader): void {
  fileChunksReader = adapter;
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

  const step = Math.max(
    1,
    Math.floor(
      chunks.length /
        Math.ceil(budget / (totalChars / chunks.length)),
    ),
  );

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
      parts.push(
        `\n[...skipped chunks ${prevIndex + 1}-${chunk.chunkIndex - 1}...]\n`,
      );
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

export const readFileTool = createTool({
  name: 'readFile',
  description:
    'Read the text content of an uploaded file. For large files, returns evenly-sampled sections with skip markers.',
  parameters: z.object({
    fileId: z.string().describe('File ID to read'),
    tenantId: z.string().describe('Tenant identifier'),
  }),
  execute: async (input) => {
    if (!fileChunksReader) {
      throw new AgentProcessingError(
        'File reader not configured. Call setWeaviateAdapter() during initialization.',
        'search',
        false,
      );
    }

    try {
      const chunks = await fileChunksReader.getFileChunks(
        input.fileId,
        input.tenantId,
      );

      if (chunks.length === 0) {
        return {
          fileId: input.fileId,
          content: '[No content found]',
          includedChunks: 0,
          totalChunks: 0,
          sampled: false,
        };
      }

      const { content, includedChunks, totalChunks } =
        selectRepresentativeChunks(chunks, MAX_CONTENT_CHARS);

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
        `Failed to read file ${input.fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
