import mammoth from 'mammoth';
import { TextExtractor } from './extractor.interface';
import { ExtractionResult } from '../types/agent.types';

export class DocxExtractor implements TextExtractor {
  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      metadata: {
        messages: result.messages,
      },
    };
  }

  supportedMimeTypes(): string[] {
    return [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
  }
}
