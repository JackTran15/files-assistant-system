export interface FileUploadedEvent {
  fileId: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  size: number;
  timestamp: string;
}

export function createFileUploadedEvent(
  params: Omit<FileUploadedEvent, 'timestamp'>,
): FileUploadedEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
