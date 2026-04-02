import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import {
  TOPICS,
  DLQ_TOPICS,
  TOPIC_KEYS,
  createFileReadyEvent,
  createFileFailedEvent,
  createFileExtractedEvent,
} from '@files-assistant/events';

@Injectable()
export class KafkaEventAdapter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventAdapter.name);
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    const broker = this.config.get<string>('REDPANDA_BROKER', 'localhost:19092');
    const kafka = new Kafka({
      clientId: 'agent-service',
      brokers: [broker],
    });
    this.producer = kafka.producer();
    this.logger.log(`Kafka producer configured (broker=${broker})`);
  }

  async onModuleInit() {
    this.logger.log('Connecting Kafka producer...');
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Kafka producer...');
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  async publishFileReady(params: {
    fileId: string;
    tenantId: string;
    chunksCreated: number;
    vectorsStored: number;
  }): Promise<void> {
    const event = createFileReadyEvent(params);
    this.logger.log(
      `Publishing FILE_READY for fileId="${params.fileId}" chunks=${params.chunksCreated} vectors=${params.vectorsStored}`,
    );
    await this.sendWithContract(TOPICS.FILE_READY, params.fileId, event);
    this.logger.log(`Published FILE_READY for fileId="${params.fileId}"`);
  }

  async publishFileExtracted(params: {
    fileId: string;
    tenantId: string;
    parsedText: string;
    extractionMethod: 'haiku' | 'raw';
    characterCount: number;
  }): Promise<void> {
    const event = createFileExtractedEvent(params);
    this.logger.log(
      `Publishing FILE_EXTRACTED for fileId="${params.fileId}" chars=${params.characterCount} method="${params.extractionMethod}"`,
    );
    await this.sendWithContract(TOPICS.FILE_EXTRACTED, params.fileId, event);
    this.logger.log(`Published FILE_EXTRACTED for fileId="${params.fileId}"`);
  }

  async publishFileFailed(params: {
    fileId: string;
    tenantId: string;
    error: string;
    stage: 'extraction' | 'chunking' | 'embedding';
  }): Promise<void> {
    const event = createFileFailedEvent(params);
    this.logger.warn(
      `Publishing FILE_FAILED for fileId="${params.fileId}" stage="${params.stage}"`,
    );
    await this.sendWithContract(TOPICS.FILE_FAILED, params.fileId, event);
    this.logger.warn(`Published FILE_FAILED for fileId="${params.fileId}"`);
  }

  async publishDlq(
    topic: keyof typeof DLQ_TOPICS,
    key: string,
    payload: unknown,
  ): Promise<void> {
    const dlqTopic = DLQ_TOPICS[topic];
    await this.sendWithContract(dlqTopic, key, payload);
  }

  private async sendWithContract(
    topic: string,
    key: string,
    payload: unknown,
  ): Promise<void> {
    if (!key) {
      throw new Error(`Kafka key is required for topic "${topic}"`);
    }
    const expectedKey = TOPIC_KEYS[topic as keyof typeof TOPIC_KEYS];
    if (!expectedKey) {
      this.logger.warn(`Missing key contract for topic "${topic}"`);
    }
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(payload) }],
    });
  }
}
