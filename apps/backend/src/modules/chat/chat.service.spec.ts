import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { FileEntity } from '../files/entities/file.entity';
import { KafkaProducerService } from '../kafka/kafka.producer';
import { ChatRole } from '@files-assistant/core';

describe('ChatService', () => {
  let service: ChatService;
  let messageRepo: Record<string, jest.Mock>;
  let conversationRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    messageRepo = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((dto) => dto),
    };

    conversationRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) =>
        Promise.resolve({ ...dto, id: 'conv-1' }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ConversationEntity), useValue: conversationRepo },
        { provide: getRepositoryToken(MessageEntity), useValue: messageRepo },
        { provide: getRepositoryToken(FileEntity), useValue: {} },
        {
          provide: KafkaProducerService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('thinking tag stripping on persistence', () => {
    async function setupStreamAndSendChunks(chunks: string[]) {
      const { correlationId, conversationId } = await service.sendMessage({
        message: 'test',
        tenantId: 'tenant-1',
      });

      for (const chunk of chunks) {
        await service.handleResponseChunk({
          correlationId,
          conversationId,
          chunk,
          done: false,
          timestamp: new Date().toISOString(),
        });
      }

      return { correlationId, conversationId };
    }

    it('should strip thinking blocks from persisted content on done', async () => {
      const { correlationId, conversationId } = await setupStreamAndSendChunks([
        '<thinking>Let me search the files</thinking>',
        'Here is the answer [1].',
      ]);

      await service.handleResponseChunk({
        correlationId,
        conversationId,
        chunk: '',
        done: true,
        timestamp: new Date().toISOString(),
      });

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: ChatRole.ASSISTANT,
          content: 'Here is the answer [1].',
        }),
      );
    });

    it('should strip multiple thinking blocks from persisted content', async () => {
      const { correlationId, conversationId } = await setupStreamAndSendChunks([
        '<thinking>step 1</thinking>',
        'Part one. ',
        '<thinking>step 2</thinking>',
        'Part two.',
      ]);

      await service.handleResponseChunk({
        correlationId,
        conversationId,
        chunk: '',
        done: true,
        timestamp: new Date().toISOString(),
      });

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Part one. Part two.',
        }),
      );
    });

    it('should strip trailing partial thinking block from persisted content', async () => {
      const { correlationId, conversationId } = await setupStreamAndSendChunks([
        '<thinking>done reasoning</thinking>Answer here.',
        '<thinking>incomplete reasoning',
      ]);

      await service.handleResponseChunk({
        correlationId,
        conversationId,
        chunk: '',
        done: true,
        timestamp: new Date().toISOString(),
      });

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Answer here.',
        }),
      );
    });

    it('should strip thinking blocks from persisted content on cancel', async () => {
      const { correlationId } = await setupStreamAndSendChunks([
        '<thinking>reasoning</thinking>',
        'Partial answer so far.',
      ]);

      await service.cancelStream(correlationId);

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: ChatRole.ASSISTANT,
          content: 'Partial answer so far.',
        }),
      );
    });

    it('should not persist empty content after stripping on cancel', async () => {
      const { correlationId } = await setupStreamAndSendChunks([
        '<thinking>only thinking, no answer yet</thinking>',
      ]);

      messageRepo.save.mockClear();
      await service.cancelStream(correlationId);

      const assistantSaves = messageRepo.create.mock.calls.filter(
        ([dto]: [{ role: ChatRole }]) => dto.role === ChatRole.ASSISTANT,
      );
      expect(assistantSaves).toHaveLength(0);
    });

    it('should persist clean content when no thinking blocks present', async () => {
      const { correlationId, conversationId } = await setupStreamAndSendChunks([
        'Clean answer without any thinking.',
      ]);

      await service.handleResponseChunk({
        correlationId,
        conversationId,
        chunk: '',
        done: true,
        timestamp: new Date().toISOString(),
      });

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Clean answer without any thinking.',
        }),
      );
    });
  });

  describe('stream lifecycle guards', () => {
    it('emits terminal timeout event and cleans up stream state', async () => {
      jest.useFakeTimers();
      const { correlationId } = await service.sendMessage({
        message: 'timeout me',
        tenantId: 'tenant-1',
      });

      const stream = service.getResponseStream(correlationId);
      expect(stream).toBeDefined();

      const events: Array<{ done: boolean; cancelled?: boolean; chunk: string }> =
        [];
      const sub = stream!.subscribe((event) => {
        events.push({
          done: event.done,
          cancelled: event.cancelled,
          chunk: event.chunk,
        });
      });

      jest.advanceTimersByTime(120001);
      await Promise.resolve();

      expect(events.some((e) => e.done && e.cancelled)).toBe(true);
      expect(service.getResponseStream(correlationId)).toBeUndefined();
      sub.unsubscribe();
      jest.useRealTimers();
    });
  });
});
