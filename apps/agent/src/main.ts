import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AgentModule } from './agent.module';

async function bootstrap() {
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
          groupId: 'agent-workers',
          sessionTimeout: 30000,
        },
        run: {
          partitionsConsumedConcurrently: 3,
        },
      },
    },
  );

  await app.listen();
}

bootstrap();
