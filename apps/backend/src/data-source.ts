import 'dotenv/config';
import { DataSource } from 'typeorm';
import { migrations } from './migrations';
import { FileEntity } from './modules/files/entities/file.entity';
import { ChunkEntity } from './modules/files/entities/chunk.entity';
import { ConversationEntity } from './modules/chat/entities/conversation.entity';
import { MessageEntity } from './modules/chat/entities/message.entity';

/**
 * Standalone DataSource used by the TypeORM CLI for migration
 * generation and manual migration runs.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['DATABASE_PORT'] ?? 5432),
  database: process.env['DATABASE_NAME'] ?? 'files_assistant',
  username: process.env['DATABASE_USER'] ?? 'postgres',
  password: process.env['DATABASE_PASSWORD'] ?? 'postgres',
  entities: [FileEntity, ChunkEntity, ConversationEntity, MessageEntity],
  migrations,
});
