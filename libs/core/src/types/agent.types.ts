export interface SearchResult {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
  summary?: string;
  metadata: Record<string, unknown>;
}

export interface IngestionResult {
  fileId: string;
  chunksCreated: number;
  vectorsStored: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata: Record<string, unknown>;
}

export interface ChunkingResult {
  chunks: string[];
  totalChunks: number;
  averageChunkSize: number;
}

export interface EmbeddingResult {
  vectorsStored: number;
  collectionName: string;
}

export interface SummaryResult {
  summary: string;
  wordCount: number;
  keyTopics: string[];
}

export interface ComparisonResult {
  similarities: string[];
  differences: string[];
  summary: string;
}
