import { ChunkingResult } from '../types/agent.types';

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  /** Structural split patterns (headings, page breaks, etc.) applied before generic splitting. */
  structuralSeparators?: RegExp[];
}

/** Primary structural boundaries before generic newline/sentence/word splitting. */
export const STRUCTURAL_SEPARATORS: RegExp[] = [
  /^#{1,6}\s/gm,
  /\f/g,
  /^-{3,}$/gm,
  /^\*{3,}$/gm,
  /^(?:Section|Chapter|Part)\s+\d/gim,
  /^\d+\.\s+[A-Z]/gm,
];

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 1500,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ' ', ''],
  structuralSeparators: STRUCTURAL_SEPARATORS,
};

export interface TextChunker {
  chunk(text: string, options?: Partial<ChunkingOptions>): ChunkingResult;
}
