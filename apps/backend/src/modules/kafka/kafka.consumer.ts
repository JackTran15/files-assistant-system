import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { TOPICS, CONSUMER_GROUPS } from '@files-assistant/events';
import { FileStatus } from '@files-assistant/core';
import { FilesService } from '../files/files.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => FilesService))
    private readonly filesService: FilesService,
  ) {
    const kafka = new Kafka({
      clientId: 'backend-service',
      brokers: [this.config.get<string>('REDPANDA_BROKER', 'localhost:19092')],
    });
    this.consumer = kafka.consumer({
      groupId: CONSUMER_GROUPS.BACKEND_NOTIFICATIONS,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [TOPICS.FILE_READY, TOPICS.FILE_FAILED, TOPICS.FILE_EXTRACTED],
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const value = JSON.parse(message.value.toString());

    switch (topic) {
      case TOPICS.FILE_READY:
        await this.filesService.updateStatus(value.fileId, FileStatus.READY, {
          chunkCount: value.chunksCreated,
        });
        break;
      case TOPICS.FILE_FAILED:
        await this.filesService.updateStatus(value.fileId, FileStatus.FAILED, {
          errorMessage: value.error,
          errorStage: value.stage,
        });
        break;
      case TOPICS.FILE_EXTRACTED:
        await this.filesService.saveExtractedText(value.fileId, {
          parsedText: value.parsedText,
          extractionMethod: value.extractionMethod,
          characterCount: value.characterCount,
          pageCount: value.pageCount,
        });
        break;
      default:
        this.logger.warn(`Unhandled topic: ${topic}`);
    }
  }
}
