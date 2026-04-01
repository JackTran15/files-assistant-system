import type { StoragePort, ChunkMetadata } from '@files-assistant/core';

export function createMockEmbeddingAdapter(): StoragePort & {
  calls: Array<{ chunks: string[]; metadata: ChunkMetadata[]; tenantId: string }>;
  shouldFail: boolean;
  reset(): void;
} {
  const adapter = {
    calls: [] as Array<{ chunks: string[]; metadata: ChunkMetadata[]; tenantId: string }>,
    shouldFail: false,

    async storeChunks(
      chunks: string[],
      metadata: ChunkMetadata[],
      tenantId: string,
    ): Promise<{ chunksStored: number }> {
      adapter.calls.push({ chunks, metadata, tenantId });

      if (adapter.shouldFail) {
        const { AgentProcessingError } = await import('@files-assistant/core');
        throw new AgentProcessingError(
          'Mock storage failure: rate limited',
          'embedding',
          false,
        );
      }

      return {
        chunksStored: chunks.length,
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
