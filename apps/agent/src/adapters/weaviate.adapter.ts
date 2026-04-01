import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeaviateClient } from 'weaviate-client';
import {
  getWeaviateClient,
  ensureFileChunksCollection,
  FILE_CHUNKS_COLLECTION,
} from '@files-assistant/weaviate';
import {
  SearchPort,
  SearchResult,
  AgentProcessingError,
} from '@files-assistant/core';
import { VoyageEmbeddingAdapter } from './voyage-embedding.adapter';

@Injectable()
export class WeaviateAdapter implements SearchPort, OnModuleInit {
  private client!: WeaviateClient;

  constructor(
    private readonly config: ConfigService,
    private readonly voyageAdapter: VoyageEmbeddingAdapter,
  ) {}

  async onModuleInit() {
    this.client = await getWeaviateClient({
      host: this.config.get<string>('WEAVIATE_HOST'),
      httpPort: this.config.get<number>('WEAVIATE_HTTP_PORT'),
      grpcPort: this.config.get<number>('WEAVIATE_GRPC_PORT'),
    });
    await ensureFileChunksCollection(this.client);
  }

  async hybridSearch(
    query: string,
    tenantId: string,
    limit = 10,
    alpha = 0.75,
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding =
        await this.voyageAdapter.generateQueryEmbedding(query);
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const result = await collection.query.hybrid(query, {
        vector: queryEmbedding,
        alpha,
        limit,
        filters: collection.filter.byProperty('tenantId').equal(tenantId),
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
        ],
      });

      return result.objects.map((obj) => ({
        fileId: String(obj.properties.fileId),
        fileName: String(obj.properties.fileName),
        chunkIndex: Number(obj.properties.chunkIndex),
        content: String(obj.properties.content),
        score: obj.metadata?.score ?? 0,
        metadata: {
          startOffset: obj.properties.startOffset,
          endOffset: obj.properties.endOffset,
        },
      }));
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async keywordSearch(
    query: string,
    tenantId: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const result = await collection.query.bm25(query, {
        limit,
        filters: collection.filter.byProperty('tenantId').equal(tenantId),
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
        ],
      });

      return result.objects.map((obj) => ({
        fileId: String(obj.properties.fileId),
        fileName: String(obj.properties.fileName),
        chunkIndex: Number(obj.properties.chunkIndex),
        content: String(obj.properties.content),
        score: obj.metadata?.score ?? 0,
        metadata: {
          startOffset: obj.properties.startOffset,
          endOffset: obj.properties.endOffset,
        },
      }));
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Keyword search failed: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
