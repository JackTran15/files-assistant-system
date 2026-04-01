export interface FileReadyEvent {
  fileId: string;
  tenantId: string;
  chunksCreated: number;
  vectorsStored: number;
  timestamp: string;
}

export function createFileReadyEvent(
  params: Omit<FileReadyEvent, 'timestamp'>,
): FileReadyEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
