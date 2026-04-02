import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { SearchResult } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

type ChunkReader = {
  getChunk(fileId: string, tenantId: string, chunkIndex: number): Promise<SearchResult>;
};

let chunkReader: ChunkReader | null = null;

export function setChunkReader(adapter: ChunkReader): void {
  chunkReader = adapter;
}

export const readChunkTool = createTool({
  name: 'readChunk',
  description:
    'Read exact text content for one file chunk. Use this when a citation needs authoritative full chunk text.',
  parameters: z.object({
    fileId: z.string().describe('File ID that owns the chunk'),
    tenantId: z.string().describe('Tenant identifier'),
    chunkIndex: z
      .number()
      .int()
      .min(0)
      .describe('Zero-based chunk index in the file'),
  }),
  execute: async (input) => {
    if (!chunkReader) {
      throw new AgentProcessingError(
        'Chunk reader not configured. Call setChunkReader() during initialization.',
        'search',
        false,
      );
    }

    try {
      const chunk = await chunkReader.getChunk(
        input.fileId,
        input.tenantId,
        input.chunkIndex,
      );

      return {
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        _sourceChunks: [
          {
            fileId: chunk.fileId,
            fileName: chunk.fileName,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            score: chunk.score > 0 ? chunk.score : 1.0,
            metadata: chunk.metadata ?? {},
          },
        ],
      };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to read chunk ${input.chunkIndex} for file ${input.fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
