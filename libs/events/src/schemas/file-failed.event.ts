export interface FileFailedEvent {
  fileId: string;
  tenantId: string;
  error: string;
  stage: 'extraction' | 'chunking' | 'embedding';
  timestamp: string;
}

export function createFileFailedEvent(
  params: Omit<FileFailedEvent, 'timestamp'>,
): FileFailedEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
