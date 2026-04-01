import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import {
  TOPICS,
  createFileReadyEvent,
  createFileFailedEvent,
} from '@files-assistant/events';

@Injectable()
export class KafkaEventAdapter implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    const kafka = new Kafka({
      clientId: 'agent-service',
      brokers: [this.config.get<string>('REDPANDA_BROKER', 'localhost:19092')],
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publishFileReady(params: {
    fileId: string;
    tenantId: string;
    chunksCreated: number;
    vectorsStored: number;
  }): Promise<void> {
    const event = createFileReadyEvent(params);
    await this.producer.send({
      topic: TOPICS.FILE_READY,
      messages: [{ key: params.fileId, value: JSON.stringify(event) }],
    });
  }

  async publishFileFailed(params: {
    fileId: string;
    tenantId: string;
    error: string;
    stage: 'extraction' | 'chunking' | 'embedding';
  }): Promise<void> {
    const event = createFileFailedEvent(params);
    await this.producer.send({
      topic: TOPICS.FILE_FAILED,
      messages: [{ key: params.fileId, value: JSON.stringify(event) }],
    });
  }
}
