import { AgentProcessingError } from '@files-assistant/core';
import { STORAGE_PORT, EMBEDDING_PORT } from '@files-assistant/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IngestionConsumer } from './ingestion.consumer';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { extractTextTool } from '../tools/extract-text.tool';

jest.mock('../tools/extract-text.tool', () => ({
  extractTextTool: {
    execute: jest.fn(),
  },
}));

const mockExtract = extractTextTool.execute as jest.Mock;

function pdfEvent() {
  return {
    fileId: 'file-1',
    tenantId: 'tenant-1',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    storagePath: '/storage/report.pdf',
    size: 1024,
    timestamp: new Date().toISOString(),
  };
}

function txtEvent() {
  return {
    ...pdfEvent(),
    fileId: 'file-2',
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    storagePath: '/storage/notes.txt',
  };
}

describe('IngestionConsumer', () => {
  let consumer: IngestionConsumer;
  let kafkaAdapter: jest.Mocked<KafkaEventAdapter>;
  let storageAdapter: {
    storeChunks: jest.Mock;
    deleteByFileId: jest.Mock;
  };
  let embeddingAdapter: {
    embedDocuments: jest.Mock;
    embedQuery: jest.Mock;
  };
  const callOrder: string[] = [];

  beforeEach(async () => {
    callOrder.length = 0;

    kafkaAdapter = {
      publishFileExtracted: jest.fn().mockImplementation(() => {
        callOrder.push('publishFileExtracted');
        return Promise.resolve();
      }),
      publishFileReady: jest.fn().mockImplementation(() => {
        callOrder.push('publishFileReady');
        return Promise.resolve();
      }),
      publishFileFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    storageAdapter = {
      storeChunks: jest.fn().mockImplementation(() => {
        callOrder.push('storeChunks');
        return Promise.resolve({ chunksStored: 3 });
      }),
      deleteByFileId: jest.fn(),
    };

    embeddingAdapter = {
      embedDocuments: jest.fn().mockImplementation((texts: string[]) => {
        callOrder.push('embedDocuments');
        return Promise.resolve(texts.map(() => new Array(1024).fill(0.1)));
      }),
      embedQuery: jest.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionConsumer],
      providers: [
        { provide: KafkaEventAdapter, useValue: kafkaAdapter },
        { provide: STORAGE_PORT, useValue: storageAdapter },
        { provide: EMBEDDING_PORT, useValue: embeddingAdapter },
      ],
    }).compile();

    consumer = module.get(IngestionConsumer);

    mockExtract.mockReset();
    mockExtract.mockImplementation(async () => {
      callOrder.push('extract');
      return {
        fileId: 'file-1',
        text: 'Extracted text content that is long enough to chunk properly.',
        method: 'haiku' as const,
        characterCount: 60,
      };
    });
  });

  // 1. Successful PDF pipeline
  it('runs full PDF pipeline: extract → extracted → chunk → store → ready', async () => {
    await consumer.handleFileUploaded(pdfEvent());

    expect(mockExtract).toHaveBeenCalledWith({
      fileId: 'file-1',
      storagePath: '/storage/report.pdf',
      mimeType: 'application/pdf',
    });
    expect(kafkaAdapter.publishFileExtracted).toHaveBeenCalledTimes(1);
    expect(storageAdapter.storeChunks).toHaveBeenCalledTimes(1);
    expect(embeddingAdapter.embedDocuments).toHaveBeenCalledTimes(1);
    expect(kafkaAdapter.publishFileReady).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-1',
        tenantId: 'tenant-1',
        chunksCreated: expect.any(Number),
        vectorsStored: expect.any(Number),
      }),
    );
    const readyCall = kafkaAdapter.publishFileReady.mock.calls[0][0];
    expect(readyCall.vectorsStored).toBeGreaterThan(0);
    expect(kafkaAdapter.publishFileFailed).not.toHaveBeenCalled();
  });

  // 2. Successful TXT pipeline
  it('runs TXT pipeline with extractionMethod raw', async () => {
    mockExtract.mockResolvedValue({
      fileId: 'file-2',
      text: 'Simple text content.',
      method: 'raw' as const,
      characterCount: 20,
    } as any);

    await consumer.handleFileUploaded(txtEvent());

    expect(kafkaAdapter.publishFileExtracted).toHaveBeenCalledWith(
      expect.objectContaining({ extractionMethod: 'raw' }),
    );
    expect(kafkaAdapter.publishFileReady).toHaveBeenCalledTimes(1);
    expect(kafkaAdapter.publishFileFailed).not.toHaveBeenCalled();
  });

  // 3. Extraction failure publishes file.failed stage extraction
  it('publishes file.failed with stage extraction on extract error', async () => {
    mockExtract.mockRejectedValue(
      new AgentProcessingError('PDF parse failed', 'extraction', false),
    );

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileFailed).toHaveBeenCalledWith({
      fileId: 'file-1',
      tenantId: 'tenant-1',
      error: 'PDF parse failed',
      stage: 'extraction',
    });
    expect(kafkaAdapter.publishFileReady).not.toHaveBeenCalled();
  });

  // 4. Chunking failure (zero chunks) publishes file.failed stage chunking
  it('publishes file.failed with stage chunking when zero chunks produced', async () => {
    mockExtract.mockResolvedValue({
      fileId: 'file-1',
      text: '',
      method: 'raw' as const,
      characterCount: 0,
    } as any);

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileFailed).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'chunking' }),
    );
    expect(storageAdapter.storeChunks).not.toHaveBeenCalled();
  });

  // 5a. Embedding failure publishes file.failed stage embedding
  it('publishes file.failed with stage embedding on Voyage embed error', async () => {
    embeddingAdapter.embedDocuments.mockRejectedValue(
      new AgentProcessingError('Voyage API rate limit', 'embedding', true),
    );

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileFailed).toHaveBeenCalledWith({
      fileId: 'file-1',
      tenantId: 'tenant-1',
      error: 'Voyage API rate limit',
      stage: 'embedding',
    });
    expect(storageAdapter.storeChunks).not.toHaveBeenCalled();
    expect(kafkaAdapter.publishFileReady).not.toHaveBeenCalled();
  });

  // 5b. Storage failure publishes file.failed stage embedding
  it('publishes file.failed with stage embedding on store error', async () => {
    storageAdapter.storeChunks.mockRejectedValue(
      new AgentProcessingError('Weaviate unavailable', 'embedding', true),
    );

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileFailed).toHaveBeenCalledWith({
      fileId: 'file-1',
      tenantId: 'tenant-1',
      error: 'Weaviate unavailable',
      stage: 'embedding',
    });
    expect(kafkaAdapter.publishFileReady).not.toHaveBeenCalled();
  });

  // 6. file.extracted is published before chunking
  it('publishes file.extracted before storage', async () => {
    await consumer.handleFileUploaded(pdfEvent());

    const extractIdx = callOrder.indexOf('publishFileExtracted');
    const storeIdx = callOrder.indexOf('storeChunks');
    expect(extractIdx).toBeGreaterThanOrEqual(0);
    expect(storeIdx).toBeGreaterThanOrEqual(0);
    expect(extractIdx).toBeLessThan(storeIdx);
  });

  // 7. Non-AgentProcessingError defaults to extraction stage
  it('defaults to extraction stage for generic errors', async () => {
    mockExtract.mockRejectedValue(new Error('Unexpected network failure'));

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'extraction',
        error: 'Unexpected network failure',
      }),
    );
  });

  // 8. Correct event payload for file.extracted
  it('publishes file.extracted with correct payload fields', async () => {
    mockExtract.mockResolvedValue({
      fileId: 'file-1',
      text: 'Full document text here',
      method: 'haiku' as const,
      characterCount: 23,
    } as any);

    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileExtracted).toHaveBeenCalledWith({
      fileId: 'file-1',
      tenantId: 'tenant-1',
      parsedText: 'Full document text here',
      extractionMethod: 'haiku',
      characterCount: 23,
    });
  });

  // 9. Correct event payload for file.ready
  it('publishes file.ready with chunksCreated and vectorsStored', async () => {
    await consumer.handleFileUploaded(pdfEvent());

    expect(kafkaAdapter.publishFileReady).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-1',
        tenantId: 'tenant-1',
        chunksCreated: expect.any(Number),
        vectorsStored: expect.any(Number),
      }),
    );
    const call = kafkaAdapter.publishFileReady.mock.calls[0][0];
    expect(call.chunksCreated).toBeGreaterThan(0);
    expect(call.vectorsStored).toBeGreaterThan(0);
  });
});
