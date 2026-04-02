import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { TOPIC_KEYS } from '@files-assistant/events';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    const broker = this.config.get<string>('REDPANDA_BROKER', 'localhost:19092');
    const kafka = new Kafka({
      clientId: 'backend-service',
      brokers: [broker],
    });
    this.producer = kafka.producer({
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30000,
      },
    });
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

  async publish(topic: string, key: string, value: unknown): Promise<void> {
    if (!key) {
      throw new Error(`Kafka key is required for topic "${topic}"`);
    }
    const expectedKey = TOPIC_KEYS[topic as keyof typeof TOPIC_KEYS];
    if (!expectedKey) {
      this.logger.warn(
        `Publishing to topic "${topic}" without declared key contract`,
      );
    }
    const payloadSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
    this.logger.log(
      `Publishing event topic="${topic}" key="${key}" bytes=${payloadSize}`,
    );
    try {
      await this.producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(value) }],
      });
      this.logger.log(`Published event topic="${topic}" key="${key}"`);
    } catch (error) {
      this.logger.error(
        `Failed to publish message to topic "${topic}" with key "${key}"`,
        error instanceof Error ? error.stack : error,
      );
      throw new Error(
        `Kafka publish failed for topic "${topic}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
