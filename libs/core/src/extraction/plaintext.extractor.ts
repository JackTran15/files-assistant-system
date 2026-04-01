import { TextExtractor } from './extractor.interface';
import { ExtractionResult } from '../types/agent.types';

export class PlainTextExtractor implements TextExtractor {
  async extract(buffer: Buffer): Promise<ExtractionResult> {
    return {
      text: buffer.toString('utf-8'),
      metadata: {},
    };
  }

  supportedMimeTypes(): string[] {
    return ['text/plain', 'text/markdown', 'text/csv'];
  }
}
