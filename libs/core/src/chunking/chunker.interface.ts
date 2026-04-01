import { ChunkingResult } from '../types/agent.types';

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ' ', ''],
};

export interface TextChunker {
  chunk(text: string, options?: Partial<ChunkingOptions>): ChunkingResult;
}
