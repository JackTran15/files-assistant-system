import { TOPICS } from '../lib/topics';
import { createFileExtractedEvent } from './file-extracted.event';

describe('FileExtractedEvent', () => {
  it('TOPICS.FILE_EXTRACTED equals "file.extracted"', () => {
    expect(TOPICS.FILE_EXTRACTED).toBe('file.extracted');
  });

  it('createFileExtractedEvent returns event with ISO timestamp', () => {
    const event = createFileExtractedEvent({
      fileId: 'f-1',
      tenantId: 't-1',
      parsedText: 'hello world',
      extractionMethod: 'raw',
      characterCount: 11,
    });

    expect(event.timestamp).toBeDefined();
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  it('factory preserves all input fields', () => {
    const params = {
      fileId: 'f-2',
      tenantId: 't-2',
      parsedText: 'some extracted text',
      extractionMethod: 'haiku' as const,
      characterCount: 19,
    };

    const event = createFileExtractedEvent(params);

    expect(event.fileId).toBe(params.fileId);
    expect(event.tenantId).toBe(params.tenantId);
    expect(event.parsedText).toBe(params.parsedText);
    expect(event.extractionMethod).toBe(params.extractionMethod);
    expect(event.characterCount).toBe(params.characterCount);
  });

  it('factory handles optional pageCount', () => {
    const withoutPage = createFileExtractedEvent({
      fileId: 'f-3',
      tenantId: 't-3',
      parsedText: 'text',
      extractionMethod: 'raw',
      characterCount: 4,
    });
    expect(withoutPage.pageCount).toBeUndefined();

    const withPage = createFileExtractedEvent({
      fileId: 'f-4',
      tenantId: 't-4',
      parsedText: 'text',
      extractionMethod: 'haiku',
      characterCount: 4,
      pageCount: 3,
    });
    expect(withPage.pageCount).toBe(3);
  });
});
