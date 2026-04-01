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

  private buildFilters(
    collection: { filter: { byProperty(name: string): any } },
    tenantId: string,
    fileIds?: string[],
    chunkType?: 'parent' | 'child',
  ) {
    const filters: any[] = [
      collection.filter.byProperty('tenantId').equal(tenantId),
    ];

    if (fileIds?.length) {
      filters.push(
        collection.filter.byProperty('fileId').containsAny(fileIds),
      );
    }

    if (chunkType) {
      filters.push(
        collection.filter.byProperty('chunkType').equal(chunkType),
      );
    }

    if (filters.length === 1) return filters[0];
    return { operator: 'And', filters, value: null };
  }

  async hybridSearch(
    query: string,
    tenantId: string,
    limit = 10,
    alpha = 0.75,
    fileIds?: string[],
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding =
        await this.voyageAdapter.generateQueryEmbedding(query);
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const result = await collection.query.hybrid(query, {
        vector: queryEmbedding,
        alpha,
        limit,
        filters: this.buildFilters(collection, tenantId, fileIds, 'parent'),
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
          'summary',
        ],
      });

      return result.objects.map((obj) => ({
        fileId: String(obj.properties.fileId),
        fileName: String(obj.properties.fileName),
        chunkIndex: Number(obj.properties.chunkIndex),
        content: String(obj.properties.content),
        summary: obj.properties.summary ? String(obj.properties.summary) : undefined,
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
    fileIds?: string[],
  ): Promise<SearchResult[]> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const result = await collection.query.bm25(query, {
        limit,
        filters: this.buildFilters(collection, tenantId, fileIds, 'parent'),
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
          'summary',
        ],
      });

      return result.objects.map((obj) => ({
        fileId: String(obj.properties.fileId),
        fileName: String(obj.properties.fileName),
        chunkIndex: Number(obj.properties.chunkIndex),
        content: String(obj.properties.content),
        summary: obj.properties.summary ? String(obj.properties.summary) : undefined,
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

  async getChildChunks(
    fileId: string,
    tenantId: string,
    parentChunkIndex?: number,
  ): Promise<SearchResult[]> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const filters: any[] = [
        collection.filter.byProperty('tenantId').equal(tenantId),
        collection.filter.byProperty('fileId').equal(fileId),
        collection.filter.byProperty('chunkType').equal('child'),
      ];

      if (parentChunkIndex !== undefined) {
        filters.push(
          collection.filter
            .byProperty('parentChunkIndex')
            .equal(parentChunkIndex),
        );
      }

      const result = await collection.query.fetchObjects({
        limit: 500,
        filters: { operator: 'And', filters, value: null },
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
          'parentChunkIndex',
        ],
      });

      return result.objects
        .map((obj) => ({
          fileId: String(obj.properties.fileId),
          fileName: String(obj.properties.fileName),
          chunkIndex: Number(obj.properties.chunkIndex),
          content: String(obj.properties.content),
          score: 0,
          metadata: {
            startOffset: obj.properties.startOffset,
            endOffset: obj.properties.endOffset,
            parentChunkIndex: obj.properties.parentChunkIndex,
          },
        }))
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to fetch child chunks for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
