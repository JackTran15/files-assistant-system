import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionConsumer } from './consumers/ingestion.consumer';
import { ChatConsumer } from './consumers/chat.consumer';
import { AgentConfigModule } from './config/agent-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    AgentConfigModule,
  ],
  controllers: [IngestionConsumer, ChatConsumer],
})
export class AgentModule {}
