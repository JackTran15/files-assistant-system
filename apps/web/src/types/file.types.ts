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
  DOCX = 'docx',
  TXT = 'txt',
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  fileType: FileType;
  size: number;
  status: FileStatus;
  tenantId: string;
  chunkCount: number;
  errorMessage?: string;
  errorStage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileStatusEvent {
  fileId: string;
  status: FileStatus;
  error?: string;
}
