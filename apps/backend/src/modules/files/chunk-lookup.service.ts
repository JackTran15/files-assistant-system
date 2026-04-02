import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeaviateClient } from 'weaviate-client';
import {
  FILE_CHUNKS_COLLECTION,
  ensureFileChunksCollection,
  getWeaviateClient,
} from '@files-assistant/weaviate';

@Injectable()
export class ChunkLookupService implements OnModuleInit {
  private readonly logger = new Logger(ChunkLookupService.name);
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

  async findChunk(fileId: string, tenantId: string, chunkIndex: number) {
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
        returnProperties: ['content', 'fileId', 'chunkIndex'],
      });

      const chunk = result.objects[0];
      if (!chunk) {
        throw new NotFoundException(
          `Chunk ${chunkIndex} for file ${fileId} not found`,
        );
      }

      return {
        fileId: String(chunk.properties.fileId),
        chunkIndex: Number(chunk.properties.chunkIndex),
        content: String(chunk.properties.content),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;

      this.logger.error(
        `Failed to fetch chunk ${chunkIndex} for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
