import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Subject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { FileEntity } from '../files/entities/file.entity';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatRole, FileStatus } from '@files-assistant/core';
import { KafkaProducerService } from '../kafka/kafka.producer';
import {
  createChatRequestEvent,
  ChatResponseEvent,
} from '@files-assistant/events';

const COMPLETE_THINKING_RE = /<thinking>[\s\S]*?<\/thinking>\s*/g;
const PARTIAL_THINKING_RE = /<thinking>[\s\S]*$/;

function stripThinkingBlocks(text: string): string {
  return text.replace(COMPLETE_THINKING_RE, '').replace(PARTIAL_THINKING_RE, '').trim();
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private responseStreams = new Map<string, Subject<ChatResponseEvent>>();
  private chunkAccumulator = new Map<string, string[]>();
  private streamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private correlationConversationMap = new Map<string, string>();

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async sendMessage(
    dto: ChatMessageDto,
  ): Promise<{ correlationId: string; conversationId: string }> {
    if (dto.fileIds?.length) {
      const nonReady = await this.fileRepo.find({
        where: { id: In(dto.fileIds), status: Not(FileStatus.READY) },
        select: ['id', 'name', 'status'],
      });
      if (nonReady.length > 0) {
        throw new BadRequestException(
          `Files not ready for chat: ${nonReady.map((f) => `${f.name} (${f.status})`).join(', ')}`,
        );
      }
    }

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
        ...(dto.fileIds?.length ? { fileIds: dto.fileIds } : {}),
      }),
    );

    this.responseStreams.set(correlationId, new Subject<ChatResponseEvent>());
    this.chunkAccumulator.set(correlationId, []);
    this.correlationConversationMap.set(correlationId, conversationId);

    const timeoutHandle = setTimeout(() => {
      this.logger.warn(`Stream timeout for correlationId=${correlationId}`);
      this.cleanupStream(correlationId);
    }, 120000);
    this.streamTimeouts.set(correlationId, timeoutHandle);

    return { correlationId, conversationId };
  }

  getResponseStream(
    correlationId: string,
  ): Observable<ChatResponseEvent> | undefined {
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
      const fullContent = stripThinkingBlocks(chunks.join(''));

      try {
        await this.messageRepo.save(
          this.messageRepo.create({
            conversationId: event.conversationId,
            role: ChatRole.ASSISTANT,
            content: fullContent,
            sources:
              (event.sources as unknown as Record<string, unknown>[]) ?? null,
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

  async cancelStream(correlationId: string): Promise<void> {
    const stream = this.responseStreams.get(correlationId);
    if (!stream) return;

    const chunks = this.chunkAccumulator.get(correlationId) ?? [];
    const partialContent = chunks.join('');

    stream.next({
      correlationId,
      conversationId: '',
      chunk: '',
      done: true,
      cancelled: true,
      timestamp: new Date().toISOString(),
    });

    const cleanedPartial = stripThinkingBlocks(partialContent);
    if (cleanedPartial.length > 0) {
      const conversationId = this.correlationConversationMap.get(correlationId);
      if (conversationId) {
        try {
          await this.messageRepo.save(
            this.messageRepo.create({
              conversationId,
              role: ChatRole.ASSISTANT,
              content: cleanedPartial,
            }),
          );
        } catch (err) {
          this.logger.error(
            `Failed to persist partial message on cancel for correlationId=${correlationId}`,
            err instanceof Error ? err.stack : err,
          );
        }
      }
    }

    this.cleanupStream(correlationId);
    this.logger.log(`Stream cancelled: correlationId=${correlationId}`);
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
    this.correlationConversationMap.delete(correlationId);
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
