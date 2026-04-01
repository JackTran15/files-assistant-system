import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    const kafka = new Kafka({
      clientId: 'backend-service',
      brokers: [this.config.get<string>('REDPANDA_BROKER', 'localhost:19092')],
    });
    this.producer = kafka.producer({
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30000,
      },
    });
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publish(topic: string, key: string, value: unknown): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(value) }],
      });
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
