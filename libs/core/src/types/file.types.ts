export enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
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
