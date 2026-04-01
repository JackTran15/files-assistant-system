export enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  EXTRACTING = 'extracting',
  EXTRACTED = 'extracted',
  EMBEDDING = 'embedding',
  READY = 'ready',
  FAILED = 'failed',
}

export enum FileType {
  PDF = 'pdf',
  TXT = 'txt',
  JSON = 'json',
  MARKDOWN = 'markdown',
}

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  fileType: FileType;
  size: number;
  status: FileStatus;
  storagePath: string;
  tenantId: string;
  chunkCount?: number;
  parsedText?: string;
  extractionMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileChunk {
  id: string;
  fileId: string;
  content: string;
  index: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  tokenCount?: number;
}
