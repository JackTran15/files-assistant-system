import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, FileUploadedEvent } from '@files-assistant/events';
import {
  AgentProcessingError,
  RecursiveTextChunker,
  STORAGE_PORT,
  StoragePort,
  EMBEDDING_PORT,
  EmbeddingPort,
  buildContextualTexts,
} from '@files-assistant/core';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { extractTextTool } from '../tools/extract-text.tool';

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

@Controller()
export class IngestionConsumer {
  private readonly logger = new Logger(IngestionConsumer.name);
  private readonly chunker = new RecursiveTextChunker();

  constructor(
    private readonly kafkaEventAdapter: KafkaEventAdapter,
    @Inject(STORAGE_PORT)
    private readonly storageAdapter: StoragePort,
    @Inject(EMBEDDING_PORT)
    private readonly embeddingAdapter: EmbeddingPort,
  ) {}

  @EventPattern(TOPICS.FILE_UPLOADED)
  async handleFileUploaded(
    @Payload() event: FileUploadedEvent,
  ): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      `[${event.fileId}] Starting ingestion: ${event.fileName} (tenant=${event.tenantId}, mime=${event.mimeType})`,
    );
    this.logger.debug(`[${event.fileId}] Source storage path: ${event.storagePath}`);

    try {
      this.logger.log(
        `[${event.fileId}] Extracting text (${event.mimeType})`,
      );
      const { text, method } = (await extractTextTool.execute!({
        fileId: event.fileId,
        storagePath: event.storagePath,
        mimeType: event.mimeType,
      })) as {
        text: string;
        method: 'haiku' | 'raw';
        fileId: string;
        characterCount: number;
      };
      this.logger.log(
        `[${event.fileId}] Extracted ${text.length} chars via ${method}`,
      );

      await this.kafkaEventAdapter.publishFileExtracted({
        fileId: event.fileId,
        tenantId: event.tenantId,
        parsedText: text,
        extractionMethod: method,
        characterCount: text.length,
      });

      const { chunkOffsets } = this.chunker.chunk(text, {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });
      this.logger.log(
        `[${event.fileId}] Created ${chunkOffsets.length} chunks`,
      );

      if (chunkOffsets.length === 0) {
        throw new AgentProcessingError(
          'Text produced zero chunks',
          'chunking',
          false,
        );
      }

      const metadata = chunkOffsets.map((c, i) => ({
        fileId: event.fileId,
        fileName: event.fileName,
        chunkIndex: i,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      }));

      this.logger.log(
        `[${event.fileId}] Embedding ${chunkOffsets.length} chunks via Voyage`,
      );
      const contextualTexts = buildContextualTexts(
        text,
        chunkOffsets,
        event.fileName,
      );
      const vectors = await this.embeddingAdapter.embedDocuments(contextualTexts);
      this.logger.log(
        `[${event.fileId}] Generated ${vectors.length} embedding vectors`,
      );

      const result = await this.storageAdapter.storeChunks(
        chunkOffsets.map((c) => c.content),
        metadata,
        event.tenantId,
        vectors,
      );

      await this.kafkaEventAdapter.publishFileReady({
        fileId: event.fileId,
        tenantId: event.tenantId,
        chunksCreated: result.chunksStored,
        vectorsStored: vectors.length,
      });

      this.logger.log(
        `[${event.fileId}] Ingestion complete in ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      const stage =
        error instanceof AgentProcessingError ? error.stage : 'extraction';
      const validStage = (
        ['extraction', 'chunking', 'embedding'] as const
      ).includes(stage as 'extraction' | 'chunking' | 'embedding')
        ? (stage as 'extraction' | 'chunking' | 'embedding')
        : 'extraction';

      await this.kafkaEventAdapter.publishFileFailed({
        fileId: event.fileId,
        tenantId: event.tenantId,
        error: error instanceof Error ? error.message : String(error),
        stage: validStage,
      });

      this.logger.error(
        `[${event.fileId}] Ingestion failed at ${validStage} after ${Date.now() - startedAt}ms`,
        error,
      );
    }
  }
}
