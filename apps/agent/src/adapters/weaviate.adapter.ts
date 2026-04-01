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

@Injectable()
export class WeaviateAdapter implements SearchPort, OnModuleInit {
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

  private buildFilters(
    collection: { filter: { byProperty(name: string): any } },
    tenantId: string,
    fileIds?: string[],
  ) {
    const filters: any[] = [
      collection.filter.byProperty('tenantId').equal(tenantId),
    ];

    if (fileIds?.length) {
      filters.push(
        collection.filter.byProperty('fileId').containsAny(fileIds),
      );
    }

    if (filters.length === 1) return filters[0];
    return { operator: 'And', filters, value: null };
  }

  async search(
    query: string,
    tenantId: string,
    limit = 10,
    fileIds?: string[],
  ): Promise<SearchResult[]> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const result = await collection.query.bm25(query, {
        limit,
        filters: this.buildFilters(collection, tenantId, fileIds),
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
        `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getFileChunks(
    fileId: string,
    tenantId: string,
  ): Promise<SearchResult[]> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);

      const filters = {
        operator: 'And' as const,
        filters: [
          collection.filter.byProperty('tenantId').equal(tenantId),
          collection.filter.byProperty('fileId').equal(fileId),
        ],
        value: null,
      };

      const result = await collection.query.fetchObjects({
        limit: 500,
        filters,
        returnProperties: [
          'content',
          'fileId',
          'fileName',
          'chunkIndex',
          'startOffset',
          'endOffset',
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
          },
        }))
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to fetch chunks for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
