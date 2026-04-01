import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeaviateClient } from 'weaviate-client';
import {
  StoragePort,
  ChunkMetadata,
  AgentProcessingError,
} from '@files-assistant/core';
import {
  getWeaviateClient,
  ensureFileChunksCollection,
  FILE_CHUNKS_COLLECTION,
} from '@files-assistant/weaviate';

@Injectable()
export class WeaviateStorageAdapter implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(WeaviateStorageAdapter.name);
  private client!: WeaviateClient;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = await getWeaviateClient({
      host: this.config.get<string>('WEAVIATE_HOST'),
      httpPort: this.config.get<number>('WEAVIATE_HTTP_PORT'),
      grpcPort: this.config.get<number>('WEAVIATE_GRPC_PORT'),
    });
    await ensureFileChunksCollection(this.client);
  }

  async storeChunks(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
    vectors?: number[][],
  ): Promise<{ chunksStored: number }> {
    if (chunks.length !== metadata.length) {
      throw new AgentProcessingError(
        'storeChunks: chunks and metadata length mismatch',
        'embedding',
        false,
      );
    }

    if (vectors && vectors.length !== chunks.length) {
      throw new AgentProcessingError(
        'storeChunks: vectors and chunks length mismatch',
        'embedding',
        false,
      );
    }

    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      for (let i = 0; i < chunks.length; i++) {
        const properties = {
          content: chunks[i],
          fileId: metadata[i].fileId,
          fileName: metadata[i].fileName,
          chunkIndex: metadata[i].chunkIndex,
          tenantId,
          startOffset: metadata[i].startOffset,
          endOffset: metadata[i].endOffset,
        };

        await collection.data.insert(
          vectors?.[i]
            ? { properties, vectors: vectors[i] }
            : { properties },
        );
      }

      return { chunksStored: chunks.length };
    } catch (error: unknown) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to store chunks: ${error instanceof Error ? error.message : String(error)}`,
        'embedding',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async deleteByFileId(fileId: string, _tenantId: string): Promise<void> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);
      await collection.data.deleteMany(
        collection.filter.byProperty('fileId').equal(fileId),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `deleteByFileId failed for ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AgentProcessingError(
        `Failed to delete chunks for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'embedding',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
