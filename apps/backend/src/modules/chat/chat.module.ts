import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatStreamController } from './chat-stream.controller';
import { ChatService } from './chat.service';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    forwardRef(() => KafkaModule),
  ],
  controllers: [ChatController, ChatStreamController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
