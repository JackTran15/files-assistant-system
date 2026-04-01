import './set-test-env';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, INestMicroservice, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../../../../apps/backend/src/app/app.module';
import { IngestionConsumer } from '../../../../apps/agent/src/consumers/ingestion.consumer';
import { KafkaEventAdapter } from '../../../../apps/agent/src/adapters/kafka-event.adapter';
import { STORAGE_PORT } from '@files-assistant/core';
import { setAnthropicClient } from '../../../../apps/agent/src/tools/extract-text.tool';
import { createMockAnthropicClient, MockAnthropicClient } from './mock-anthropic';
import { createMockEmbeddingAdapter, MockEmbeddingAdapter } from './mock-embedding';

export interface TestContext {
  backendApp: INestApplication;
  agentApp: INestMicroservice;
  httpServer: ReturnType<INestApplication['getHttpServer']>;
  mockAnthropic: MockAnthropicClient;
  mockEmbedding: MockEmbeddingAdapter;
  request: ReturnType<typeof request>;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [],
    }),
  ],
  controllers: [IngestionConsumer],
  providers: [
    KafkaEventAdapter,
    {
      provide: STORAGE_PORT,
      useValue: null,
    },
  ],
})
class TestAgentModule {}

export async function bootstrapTestApps(): Promise<TestContext> {
  const mockAnthropic = createMockAnthropicClient();
  const mockEmbedding = createMockEmbeddingAdapter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAnthropicClient(mockAnthropic as any);

  const backendModule: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const backendApp = backendModule.createNestApplication();
  backendApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await backendApp.init();
  await backendApp.listen(0);

  const agentModule: TestingModule = await Test.createTestingModule({
    imports: [TestAgentModule],
  })
    .overrideProvider(STORAGE_PORT)
    .useValue(mockEmbedding)
    .compile();

  const agentApp = agentModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: ['localhost:19092'],
        clientId: 'e2e-agent-service',
      },
      consumer: {
        groupId: 'e2e-agent-workers',
        sessionTimeout: 15000,
      },
    },
  });

  await agentApp.listen();

  const httpServer = backendApp.getHttpServer();

  await new Promise((r) => setTimeout(r, 2000));

  return {
    backendApp,
    agentApp,
    httpServer,
    mockAnthropic,
    mockEmbedding,
    request: request(httpServer),
  };
}

export async function teardownTestApps(ctx: TestContext): Promise<void> {
  if (ctx?.agentApp) {
    await ctx.agentApp.close().catch(() => {/* ignore */});
  }
  if (ctx?.backendApp) {
    await ctx.backendApp.close().catch(() => {/* ignore */});
  }
}
