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
    const broker = this.config.get<string>('REDPANDA_BROKER', 'localhost:19092');
    const kafka = new Kafka({
      clientId: 'backend-service',
      brokers: [broker],
    });
    this.consumer = kafka.consumer({
      groupId: CONSUMER_GROUPS.BACKEND_NOTIFICATIONS,
    });
    this.logger.log(
      `Kafka consumer configured (group=${CONSUMER_GROUPS.BACKEND_NOTIFICATIONS}, broker=${broker})`,
    );
  }

  async onModuleInit() {
    this.logger.log('Connecting Kafka consumer...');
    await this.consumer.connect();
    this.logger.log('Kafka consumer connected');
    await this.consumer.subscribe({
      topics: [TOPICS.FILE_READY, TOPICS.FILE_FAILED, TOPICS.FILE_EXTRACTED],
      fromBeginning: false,
    });
    this.logger.log(
      `Subscribed to topics: ${TOPICS.FILE_READY}, ${TOPICS.FILE_FAILED}, ${TOPICS.FILE_EXTRACTED}`,
    );
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
    this.logger.log('Kafka consumer run loop started');
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Kafka consumer...');
    await this.consumer.disconnect();
    this.logger.log('Kafka consumer disconnected');
  }

  private async handleMessage({
    topic,
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    if (!message.value) {
      this.logger.warn(`Skipping empty Kafka message on topic "${topic}"`);
      return;
    }
    const value = JSON.parse(message.value.toString());
    this.logger.log(
      `Received event topic="${topic}" key="${message.key?.toString() ?? 'none'}" partition=${partition} offset=${message.offset ?? 'n/a'}`,
    );

    switch (topic) {
      case TOPICS.FILE_READY:
        await this.filesService.updateStatus(value.fileId, FileStatus.READY, {
          chunkCount: value.chunksCreated,
        });
        this.logger.log(
          `Processed FILE_READY for fileId="${value.fileId}" chunksCreated=${value.chunksCreated}`,
        );
        break;
      case TOPICS.FILE_FAILED:
        await this.filesService.updateStatus(value.fileId, FileStatus.FAILED, {
          errorMessage: value.error,
          errorStage: value.stage,
        });
        this.logger.warn(
          `Processed FILE_FAILED for fileId="${value.fileId}" stage="${value.stage}"`,
        );
        break;
      case TOPICS.FILE_EXTRACTED:
        await this.filesService.saveExtractedText(value.fileId, {
          parsedText: value.parsedText,
          extractionMethod: value.extractionMethod,
          characterCount: value.characterCount,
          pageCount: value.pageCount,
        });
        this.logger.log(
          `Processed FILE_EXTRACTED for fileId="${value.fileId}" chars=${value.characterCount} method="${value.extractionMethod}"`,
        );
        break;
      default:
        this.logger.warn(`Unhandled topic: ${topic}`);
    }
  }
}
