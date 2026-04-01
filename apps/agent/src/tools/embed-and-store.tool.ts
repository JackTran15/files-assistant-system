import { createTool } from '@voltagent/core';
import { z } from 'zod';
import type { EmbeddingPort, ChunkMetadata } from '@files-assistant/core';
import { AgentProcessingError } from '@files-assistant/core';

let embeddingAdapter: EmbeddingPort | null = null;

export function setEmbeddingAdapter(adapter: EmbeddingPort): void {
  embeddingAdapter = adapter;
}

export const embedAndStoreTool = createTool({
  name: 'embedAndStore',
  description:
    'Generate embeddings for text chunks and store them in the vector database',
  parameters: z.object({
    fileId: z.string().describe('File ID these chunks belong to'),
    fileName: z.string().describe('Original file name'),
    tenantId: z.string().describe('Tenant identifier'),
    chunks: z.array(z.string()).describe('Text chunks to embed and store'),
  }),
  execute: async (input) => {
    if (!embeddingAdapter) {
      throw new AgentProcessingError(
        'Embedding adapter not configured. Call setEmbeddingAdapter() during initialization.',
        'embedding',
        false,
      );
    }

    try {
      let offset = 0;
      const metadata: ChunkMetadata[] = input.chunks.map((chunk, i) => {
        const startOffset = offset;
        offset += chunk.length;
        return {
          fileId: input.fileId,
          fileName: input.fileName,
          chunkIndex: i,
          startOffset,
          endOffset: offset,
        };
      });

      return await embeddingAdapter.embedAndStore(
        input.chunks,
        metadata,
        input.tenantId,
      );
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to embed and store chunks for file ${input.fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'embedding',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  },
});
