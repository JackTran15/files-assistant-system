import { AgentProcessingError } from '@files-assistant/core';
import {
  RateLimitError,
  APIConnectionTimeoutError,
} from '@anthropic-ai/sdk';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

import * as fs from 'node:fs/promises';
import { extractTextTool, setAnthropicClient } from './extract-text.tool';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

interface ExtractResult {
  fileId: string;
  text: string;
  method: 'haiku' | 'raw';
  characterCount: number;
}

function createMockAnthropicClient(createFn: jest.Mock) {
  return { messages: { create: createFn } } as any;
}

function successResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

async function execute(input: {
  fileId: string;
  storagePath: string;
  mimeType: string;
}): Promise<ExtractResult> {
  return extractTextTool.execute!(input) as Promise<ExtractResult>;
}

describe('extractTextTool', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    setAnthropicClient(createMockAnthropicClient(mockCreate));
  });

  // 1. Routes PDF MIME type to Haiku extraction
  it('routes PDF to Haiku extraction', async () => {
    const pdfBuffer = Buffer.from('fake-pdf');
    mockReadFile.mockResolvedValue(pdfBuffer as any);
    mockCreate.mockResolvedValue(successResponse('Extracted PDF text'));

    const result = await execute({
      fileId: 'f-1',
      storagePath: '/tmp/test.pdf',
      mimeType: 'application/pdf',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      fileId: 'f-1',
      text: 'Extracted PDF text',
      method: 'haiku',
    });
  });

  // 2. Routes text/plain to raw extraction
  it('routes text/plain to raw extraction', async () => {
    mockReadFile.mockResolvedValue('Hello plain text' as any);

    const result = await execute({
      fileId: 'f-2',
      storagePath: '/tmp/test.txt',
      mimeType: 'text/plain',
    });

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.txt', 'utf-8');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ method: 'raw' });
  });

  // 3. Routes text/markdown to raw extraction
  it('routes text/markdown to raw extraction', async () => {
    mockReadFile.mockResolvedValue('# Heading' as any);

    const result = await execute({
      fileId: 'f-3',
      storagePath: '/tmp/test.md',
      mimeType: 'text/markdown',
    });

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.md', 'utf-8');
    expect(result).toMatchObject({ method: 'raw' });
  });

  // 4. Routes application/json to raw extraction
  it('routes application/json to raw extraction', async () => {
    mockReadFile.mockResolvedValue('{"key":"value"}' as any);

    const result = await execute({
      fileId: 'f-4',
      storagePath: '/tmp/test.json',
      mimeType: 'application/json',
    });

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.json', 'utf-8');
    expect(result).toMatchObject({ method: 'raw' });
  });

  // 5. Haiku receives correct document block
  it('sends correct document block to Haiku for PDF', async () => {
    const pdfBuffer = Buffer.from('pdf-content');
    mockReadFile.mockResolvedValue(pdfBuffer as any);
    mockCreate.mockResolvedValue(successResponse('text'));

    await execute({
      fileId: 'f-5',
      storagePath: '/tmp/doc.pdf',
      mimeType: 'application/pdf',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const docBlock = callArgs.messages[0].content[0];
    expect(docBlock.type).toBe('document');
    expect(docBlock.source.media_type).toBe('application/pdf');
    expect(docBlock.source.type).toBe('base64');
    expect(docBlock.source.data).toBe(pdfBuffer.toString('base64'));
  });

  // 6. Haiku prompt asks for verbatim extraction
  it('includes verbatim extraction instruction in prompt', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('pdf') as any);
    mockCreate.mockResolvedValue(successResponse('text'));

    await execute({
      fileId: 'f-6',
      storagePath: '/tmp/doc.pdf',
      mimeType: 'application/pdf',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const textBlock = callArgs.messages[0].content[1];
    expect(textBlock.text).toContain('Do not summarize or interpret');
  });

  // 7. Returns method: 'haiku' for PDF
  it('returns method haiku for PDF', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('pdf') as any);
    mockCreate.mockResolvedValue(successResponse('extracted'));

    const result = await execute({
      fileId: 'f-7',
      storagePath: '/tmp/doc.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.method).toBe('haiku');
  });

  // 8. Returns method: 'raw' for TXT/MD/JSON
  it('returns method raw for plain text types', async () => {
    for (const mime of ['text/plain', 'text/markdown', 'application/json']) {
      mockReadFile.mockResolvedValue('content' as any);

      const result = await execute({
        fileId: 'f-8',
        storagePath: '/tmp/file',
        mimeType: mime,
      });

      expect(result.method).toBe('raw');
    }
  });

  // 9. Returns correct characterCount
  it('returns correct characterCount', async () => {
    const text = 'Hello, world! 123';
    mockReadFile.mockResolvedValue(text as any);

    const result = await execute({
      fileId: 'f-9',
      storagePath: '/tmp/test.txt',
      mimeType: 'text/plain',
    });

    expect(result.characterCount).toBe(text.length);
  });

  // 10. Empty Haiku response throws AgentProcessingError
  it('throws on empty Haiku response', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('pdf') as any);
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '   ' }] });

    await expect(
      execute({
        fileId: 'f-10',
        storagePath: '/tmp/doc.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(AgentProcessingError);

    try {
      await execute({
        fileId: 'f-10',
        storagePath: '/tmp/doc.pdf',
        mimeType: 'application/pdf',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(AgentProcessingError);
      expect((e as AgentProcessingError).stage).toBe('extraction');
    }
  });

  // 11. Haiku API 429 throws retryable error
  it('wraps RateLimitError as retryable AgentProcessingError', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('pdf') as any);
    mockCreate.mockRejectedValue(
      new RateLimitError(429, undefined, 'rate limited', undefined as any),
    );

    try {
      await execute({
        fileId: 'f-11',
        storagePath: '/tmp/doc.pdf',
        mimeType: 'application/pdf',
      });
      fail('expected error');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentProcessingError);
      expect((e as AgentProcessingError).retryable).toBe(true);
      expect((e as AgentProcessingError).stage).toBe('extraction');
    }
  });

  // 12. Missing file throws non-retryable error
  it('throws non-retryable error for missing file', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(enoent);

    try {
      await execute({
        fileId: 'f-12',
        storagePath: '/tmp/missing.txt',
        mimeType: 'text/plain',
      });
      fail('expected error');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentProcessingError);
      expect((e as AgentProcessingError).retryable).toBe(false);
      expect((e as AgentProcessingError).message).toContain(
        'File not found at storage path',
      );
    }
  });

  // 13. Raw extraction preserves UTF-8 content
  it('preserves UTF-8 content in raw extraction', async () => {
    const utf8Content = 'Héllo wörld! 日本語テスト 🎉';
    mockReadFile.mockResolvedValue(utf8Content as any);

    const result = await execute({
      fileId: 'f-13',
      storagePath: '/tmp/test.txt',
      mimeType: 'text/plain',
    });

    expect(result.text).toBe(utf8Content);
  });

  // 14. Uses model from config
  it('uses model from ANTHROPIC_HAIKU_MODEL env var', async () => {
    const originalEnv = process.env['ANTHROPIC_HAIKU_MODEL'];
    process.env['ANTHROPIC_HAIKU_MODEL'] = 'claude-3-haiku-custom';

    mockReadFile.mockResolvedValue(Buffer.from('pdf') as any);
    mockCreate.mockResolvedValue(successResponse('text'));

    await execute({
      fileId: 'f-14',
      storagePath: '/tmp/doc.pdf',
      mimeType: 'application/pdf',
    });

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-3-haiku-custom');

    if (originalEnv === undefined) {
      delete process.env['ANTHROPIC_HAIKU_MODEL'];
    } else {
      process.env['ANTHROPIC_HAIKU_MODEL'] = originalEnv;
    }
  });
});
