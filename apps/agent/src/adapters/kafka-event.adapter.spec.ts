import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { KafkaEventAdapter } from './kafka-event.adapter';

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => ({
      send: mockSend,
      connect: mockConnect,
      disconnect: mockDisconnect,
    }),
  })),
}));

describe('KafkaEventAdapter – publishFileExtracted', () => {
  let adapter: KafkaEventAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaEventAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('localhost:19092'),
          },
        },
      ],
    }).compile();

    adapter = module.get(KafkaEventAdapter);
    await adapter.onModuleInit();
  });

  const params = {
    fileId: 'file-1',
    tenantId: 'tenant-1',
    parsedText: 'Hello world',
    extractionMethod: 'haiku' as const,
    characterCount: 11,
  };

  // 1. Sends to correct topic
  it('sends to file.extracted topic', async () => {
    await adapter.publishFileExtracted(params);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].topic).toBe('file.extracted');
  });

  // 2. Message key is fileId
  it('uses fileId as message key', async () => {
    await adapter.publishFileExtracted(params);

    const messages = mockSend.mock.calls[0][0].messages;
    expect(messages[0].key).toBe('file-1');
  });

  // 3. Message value is valid JSON with all fields
  it('sends valid JSON with all event fields', async () => {
    await adapter.publishFileExtracted(params);

    const raw = mockSend.mock.calls[0][0].messages[0].value;
    const parsed = JSON.parse(raw);

    expect(parsed.fileId).toBe('file-1');
    expect(parsed.tenantId).toBe('tenant-1');
    expect(parsed.parsedText).toBe('Hello world');
    expect(parsed.extractionMethod).toBe('haiku');
    expect(parsed.characterCount).toBe(11);
  });

  // 4. Event includes auto-generated timestamp
  it('includes auto-generated ISO timestamp', async () => {
    const before = new Date().toISOString();
    await adapter.publishFileExtracted(params);
    const after = new Date().toISOString();

    const raw = mockSend.mock.calls[0][0].messages[0].value;
    const parsed = JSON.parse(raw);

    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.timestamp >= before).toBe(true);
    expect(parsed.timestamp <= after).toBe(true);
  });
});
