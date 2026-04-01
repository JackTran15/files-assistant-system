export interface SearchResult {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IngestionResult {
  fileId: string;
  chunksCreated: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata: Record<string, unknown>;
}

export interface ChunkWithOffset {
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkingResult {
  chunks: string[];
  chunkOffsets: ChunkWithOffset[];
  totalChunks: number;
  averageChunkSize: number;
}
