import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, FileUploadedEvent } from '@files-assistant/events';
import { AgentProcessingError } from '@files-assistant/core';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';

@Controller()
export class IngestionConsumer {
  private readonly logger = new Logger(IngestionConsumer.name);

  constructor(
    private readonly kafkaEventAdapter: KafkaEventAdapter,
    @Inject('SUPERVISOR_AGENT')
    private readonly supervisorAgent: {
      generateText: (opts: {
        input: string;
      }) => Promise<Record<string, unknown>>;
    },
  ) {}

  @EventPattern(TOPICS.FILE_UPLOADED)
  async handleFileUploaded(@Payload() event: FileUploadedEvent): Promise<void> {
    this.logger.log(`Processing file: ${event.fileId} (${event.fileName})`);

    try {
      const result = (await this.supervisorAgent.generateText({
        input: `Process file: ${event.fileName} (${event.mimeType}) at ${event.storagePath}. TenantId: ${event.tenantId}, FileId: ${event.fileId}. Extract text, chunk it, generate embeddings, and store in Weaviate.`,
      })) as { chunksCreated?: number; vectorsStored?: number };

      await this.kafkaEventAdapter.publishFileReady({
        fileId: event.fileId,
        tenantId: event.tenantId,
        chunksCreated: result.chunksCreated ?? 0,
        vectorsStored: result.vectorsStored ?? 0,
      });

      this.logger.log(`File ${event.fileId} ingestion complete`);
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

      this.logger.error(`File ${event.fileId} ingestion failed`, error);
    }
  }
}
