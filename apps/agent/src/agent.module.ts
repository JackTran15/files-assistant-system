import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionConsumer } from './consumers/ingestion.consumer';
import { ChatConsumer } from './consumers/chat.consumer';
import { AgentConfigModule } from './config/agent-config.module';

const workerMode = process.env['AGENT_WORKER_MODE'] ?? 'all';
const controllers =
  workerMode === 'chat'
    ? [ChatConsumer]
    : workerMode === 'ingestion'
      ? [IngestionConsumer]
      : [IngestionConsumer, ChatConsumer];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    AgentConfigModule,
  ],
  controllers,
})
export class AgentModule {}
