import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AgentModule } from './agent.module';
import { CONSUMER_GROUPS } from '@files-assistant/events';

type WorkerMode = 'all' | 'chat' | 'ingestion';

function resolveGroupId(mode: WorkerMode): string {
  if (mode === 'chat') return CONSUMER_GROUPS.AGENT_CHAT;
  if (mode === 'ingestion') return CONSUMER_GROUPS.AGENT_INGESTION;
  return process.env['AGENT_CONSUMER_GROUP_ID'] || 'agent-workers';
}

async function bootstrap() {
  const mode = (process.env['AGENT_WORKER_MODE'] || 'all') as WorkerMode;
  const partitionsConsumedConcurrently = Number(
    process.env['AGENT_KAFKA_PARTITIONS_CONCURRENTLY'] || '3',
  );

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AgentModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: [process.env['REDPANDA_BROKER'] || 'localhost:19092'],
          clientId: 'agent-service',
        },
        consumer: {
          groupId: resolveGroupId(mode),
          sessionTimeout: 30000,
        },
        run: {
          partitionsConsumedConcurrently,
        },
      },
    },
  );

  await app.listen();
}

bootstrap();
