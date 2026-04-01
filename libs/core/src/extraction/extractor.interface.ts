import { ExtractionResult } from '../types/agent.types';

export interface TextExtractor {
  extract(buffer: Buffer): Promise<ExtractionResult>;
  supportedMimeTypes(): string[];
}
