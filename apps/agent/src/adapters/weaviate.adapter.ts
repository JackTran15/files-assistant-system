import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  EMBEDDING_PORT,
  EmbeddingPort,
} from '@files-assistant/core';

const DEFAULT_HYBRID_ALPHA = 0.75;

@Injectable()
export class WeaviateAdapter implements SearchPort, OnModuleInit {
  private readonly logger = new Logger(WeaviateAdapter.name);
  private client!: WeaviateClient;
  private alpha!: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(EMBEDDING_PORT)
    private readonly embeddingAdapter: EmbeddingPort,
  ) {}

  async onModuleInit() {
    this.client = await getWeaviateClient({
      host: this.config.get<string>('WEAVIATE_HOST'),
      httpPort: this.config.get<number>('WEAVIATE_HTTP_PORT'),
      grpcPort: this.config.get<number>('WEAVIATE_GRPC_PORT'),
    });
    await ensureFileChunksCollection(this.client);
    this.alpha =
      parseFloat(this.config.get<string>('HYBRID_ALPHA') ?? '') ||
      DEFAULT_HYBRID_ALPHA;
    this.logger.log(`Hybrid search alpha: ${this.alpha}`);
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
      const queryVector = await this.embeddingAdapter.embedQuery(query);

      const result = await collection.query.hybrid(query, {
        limit,
        alpha: this.alpha,
        vector: queryVector,
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

  async getChunk(
    fileId: string,
    tenantId: string,
    chunkIndex: number,
  ): Promise<SearchResult> {
    try {
      const collection = this.client.collections.get(FILE_CHUNKS_COLLECTION);
      const filters = {
        operator: 'And' as const,
        filters: [
          collection.filter.byProperty('tenantId').equal(tenantId),
          collection.filter.byProperty('fileId').equal(fileId),
          collection.filter.byProperty('chunkIndex').equal(chunkIndex),
        ],
        value: null,
      };

      const result = await collection.query.fetchObjects({
        limit: 1,
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

      const chunk = result.objects[0];
      if (!chunk) {
        throw new AgentProcessingError(
          `Chunk ${chunkIndex} for file ${fileId} not found`,
          'search',
          false,
        );
      }

      return {
        fileId: String(chunk.properties.fileId),
        fileName: String(chunk.properties.fileName),
        chunkIndex: Number(chunk.properties.chunkIndex),
        content: String(chunk.properties.content),
        score: 1.0,
        metadata: {
          startOffset: chunk.properties.startOffset,
          endOffset: chunk.properties.endOffset,
        },
      };
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Failed to fetch chunk ${chunkIndex} for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
