import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../modules/config/config.module';
import { HealthModule } from '../modules/health/health.module';
import { FilesModule } from '../modules/files/files.module';
import { ChatModule } from '../modules/chat/chat.module';
import { KafkaModule } from '../modules/kafka/kafka.module';
import { StorageModule } from '../modules/storage/storage.module';
import { migrations } from '../migrations/index';
import { FileEntity } from '../modules/files/entities/file.entity';
import { ChunkEntity } from '../modules/files/entities/chunk.entity';
import { ConversationEntity } from '../modules/chat/entities/conversation.entity';
import { MessageEntity } from '../modules/chat/entities/message.entity';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        database: config.get<string>('DATABASE_NAME'),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD'),
        entities: [FileEntity, ChunkEntity, ConversationEntity, MessageEntity],
        synchronize: false,
        migrationsRun: true,
        migrations,
      }),
    }),
    HealthModule,
    FilesModule,
    ChatModule,
    KafkaModule,
    StorageModule,
  ],
})
export class AppModule {}
