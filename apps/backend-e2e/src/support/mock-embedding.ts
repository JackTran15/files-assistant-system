import type { EmbeddingPort, ChunkMetadata, EmbeddingResult } from '@files-assistant/core';

export function createMockEmbeddingAdapter(): EmbeddingPort & {
  calls: Array<{ chunks: string[]; metadata: ChunkMetadata[]; tenantId: string }>;
  shouldFail: boolean;
  reset(): void;
} {
  const adapter = {
    calls: [] as Array<{ chunks: string[]; metadata: ChunkMetadata[]; tenantId: string }>,
    shouldFail: false,

    async embedAndStore(
      chunks: string[],
      metadata: ChunkMetadata[],
      tenantId: string,
    ): Promise<EmbeddingResult> {
      adapter.calls.push({ chunks, metadata, tenantId });

      if (adapter.shouldFail) {
        const { AgentProcessingError } = await import('@files-assistant/core');
        throw new AgentProcessingError(
          'Mock embedding failure: rate limited',
          'embedding',
          false,
        );
      }

      return {
        vectorsStored: chunks.length,
        collectionName: 'FileChunks',
      };
    },

    async deleteByFileId(): Promise<void> {
      // no-op
    },

    reset() {
      adapter.calls = [];
      adapter.shouldFail = false;
    },
  };

  return adapter;
}

export type MockEmbeddingAdapter = ReturnType<typeof createMockEmbeddingAdapter>;
