import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatRole } from '@files-assistant/core';
import { KafkaProducerService } from '../kafka/kafka.producer';
import { createChatRequestEvent, ChatResponseEvent } from '@files-assistant/events';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private responseStreams = new Map<string, Subject<ChatResponseEvent>>();
  private chunkAccumulator = new Map<string, string[]>();
  private streamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async sendMessage(dto: ChatMessageDto): Promise<{ correlationId: string; conversationId: string }> {
    let conversationId = dto.conversationId;

    if (!conversationId) {
      const conversation = this.conversationRepo.create({
        tenantId: dto.tenantId,
        title: dto.message.slice(0, 100),
      });
      const saved = await this.conversationRepo.save(conversation);
      conversationId = saved.id;
    }

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        role: ChatRole.USER,
        content: dto.message,
      }),
    );

    const correlationId = uuidv4();

    await this.kafkaProducer.publish(
      'chat.request',
      correlationId,
      createChatRequestEvent({
        correlationId,
        conversationId,
        tenantId: dto.tenantId,
        message: dto.message,
      }),
    );

    this.responseStreams.set(correlationId, new Subject<ChatResponseEvent>());
    this.chunkAccumulator.set(correlationId, []);

    const timeoutHandle = setTimeout(() => {
      this.logger.warn(`Stream timeout for correlationId=${correlationId}`);
      this.cleanupStream(correlationId);
    }, 120000);
    this.streamTimeouts.set(correlationId, timeoutHandle);

    return { correlationId, conversationId };
  }

  getResponseStream(correlationId: string): Observable<ChatResponseEvent> | undefined {
    return this.responseStreams.get(correlationId)?.asObservable();
  }

  async handleResponseChunk(event: ChatResponseEvent): Promise<void> {
    const stream = this.responseStreams.get(event.correlationId);
    if (!stream) return;

    if (event.chunk) {
      const chunks = this.chunkAccumulator.get(event.correlationId);
      chunks?.push(event.chunk);
    }

    stream.next(event);

    if (event.done) {
      const chunks = this.chunkAccumulator.get(event.correlationId) ?? [];
      const fullContent = chunks.join('');

      try {
        await this.messageRepo.save(
          this.messageRepo.create({
            conversationId: event.conversationId,
            role: ChatRole.ASSISTANT,
            content: fullContent,
            sources: (event.sources as unknown as Record<string, unknown>[]) ?? null,
            confidenceScore: event.confidenceScore ?? null,
          }),
        );
      } catch (err) {
        this.logger.error(
          `Failed to persist assistant message for correlationId=${event.correlationId}`,
          err instanceof Error ? err.stack : err,
        );
      }

      this.cleanupStream(event.correlationId);
    }
  }

  cleanupStream(correlationId: string): void {
    const timeout = this.streamTimeouts.get(correlationId);
    if (timeout) {
      clearTimeout(timeout);
      this.streamTimeouts.delete(correlationId);
    }

    const stream = this.responseStreams.get(correlationId);
    if (stream) {
      stream.complete();
      this.responseStreams.delete(correlationId);
    }

    this.chunkAccumulator.delete(correlationId);
  }

  async getHistory(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await this.conversationRepo.findAndCount({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['messages'],
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
