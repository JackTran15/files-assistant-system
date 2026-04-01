export interface FileExtractedEvent {
  fileId: string;
  tenantId: string;
  parsedText: string;
  extractionMethod: 'haiku' | 'raw';
  pageCount?: number;
  characterCount: number;
  timestamp: string;
}

export function createFileExtractedEvent(
  params: Omit<FileExtractedEvent, 'timestamp'>,
): FileExtractedEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
