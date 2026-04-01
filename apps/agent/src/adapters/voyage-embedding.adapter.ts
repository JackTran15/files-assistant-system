import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoyageAIClient } from 'voyageai';
import { WeaviateClient } from 'weaviate-client';
import {
  EmbeddingPort,
  ChunkMetadata,
  ParentChunkData,
  ChildChunkData,
  EmbeddingResult,
  AgentProcessingError,
} from '@files-assistant/core';
import {
  getWeaviateClient,
  FILE_CHUNKS_COLLECTION,
} from '@files-assistant/weaviate';

@Injectable()
export class VoyageEmbeddingAdapter implements EmbeddingPort, OnModuleInit {
  private readonly logger = new Logger(VoyageEmbeddingAdapter.name);
  private voyage!: VoyageAIClient;
  private weaviateClient!: WeaviateClient;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.voyage = new VoyageAIClient({
      apiKey: this.config.get<string>('VOYAGE_API_KEY'),
    });
    this.weaviateClient = await getWeaviateClient({
      host: this.config.get<string>('WEAVIATE_HOST'),
      httpPort: this.config.get<number>('WEAVIATE_HTTP_PORT'),
      grpcPort: this.config.get<number>('WEAVIATE_GRPC_PORT'),
    });
  }

  async embedAndStore(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
  ): Promise<EmbeddingResult> {
    const embeddings = await this.embedWithRetry(chunks);

    const collection = this.weaviateClient.collections.get(
      FILE_CHUNKS_COLLECTION,
    );
    for (let i = 0; i < chunks.length; i++) {
      await collection.data.insert({
        properties: {
          content: chunks[i],
          fileId: metadata[i].fileId,
          fileName: metadata[i].fileName,
          chunkIndex: metadata[i].chunkIndex,
          tenantId,
          startOffset: metadata[i].startOffset,
          endOffset: metadata[i].endOffset,
        },
        vectors: embeddings[i],
      });
    }

    return {
      vectorsStored: chunks.length,
      collectionName: FILE_CHUNKS_COLLECTION,
    };
  }

  async embedAndStoreHierarchical(
    parents: ParentChunkData[],
    children: ChildChunkData[],
    tenantId: string,
  ): Promise<EmbeddingResult> {
    const summaries = parents.map((p) => p.summary);
    const embeddings = await this.embedWithRetry(summaries);

    const collection = this.weaviateClient.collections.get(
      FILE_CHUNKS_COLLECTION,
    );

    for (let i = 0; i < parents.length; i++) {
      await collection.data.insert({
        properties: {
          content: parents[i].content,
          fileId: parents[i].fileId,
          fileName: parents[i].fileName,
          chunkIndex: parents[i].chunkIndex,
          tenantId,
          startOffset: parents[i].startOffset,
          endOffset: parents[i].endOffset,
          chunkType: 'parent',
          summary: parents[i].summary,
          parentChunkIndex: -1,
        },
        vectors: embeddings[i],
      });
    }

    for (const child of children) {
      await collection.data.insert({
        properties: {
          content: child.content,
          fileId: child.fileId,
          fileName: child.fileName,
          chunkIndex: child.chunkIndex,
          tenantId,
          startOffset: child.startOffset,
          endOffset: child.endOffset,
          chunkType: 'child',
          summary: '',
          parentChunkIndex: child.parentChunkIndex,
        },
      });
    }

    return {
      vectorsStored: parents.length,
      collectionName: FILE_CHUNKS_COLLECTION,
    };
  }

  async deleteByFileId(fileId: string, _tenantId: string): Promise<void> {
    const collection = this.weaviateClient.collections.get(
      FILE_CHUNKS_COLLECTION,
    );
    await collection.data.deleteMany(
      collection.filter.byProperty('fileId').equal(fileId),
    );
  }

  async generateQueryEmbedding(query: string): Promise<number[]> {
    const response = await this.embedWithRetry([query]);
    return response[0];
  }

  private async embedWithRetry(
    inputs: string[],
    maxRetries = 3,
  ): Promise<number[][]> {
    const hasEmpty = inputs.some((s) => !s.trim());
    if (hasEmpty) {
      this.logger.warn(
        `Filtering ${inputs.filter((s) => !s.trim()).length} empty strings from ${inputs.length} embedding inputs`,
      );
      inputs = inputs.filter((s) => s.trim().length > 0);
    }
    if (inputs.length === 0) {
      throw new AgentProcessingError(
        'All embedding inputs were empty after filtering',
        'embedding',
        false,
      );
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.voyage.embed({
          input: inputs,
          model: 'voyage-3-lite',
        });
        return response.data!.map((d) => d.embedding!);
      } catch (error: unknown) {
        const err = error as { status?: number };
        if (err.status === 429 && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Voyage rate limited, retrying in ${backoff}ms (attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new AgentProcessingError(
          `Embedding failed after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`,
          'embedding',
          err.status === 429,
          error instanceof Error ? error : undefined,
        );
      }
    }
    throw new AgentProcessingError(
      'Embedding failed: max retries exceeded',
      'embedding',
      false,
    );
  }
}
