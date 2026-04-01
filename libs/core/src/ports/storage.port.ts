import { ChunkMetadata } from '../types/file.types';

export interface StoragePort {
  storeChunks(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
    vectors?: number[][],
  ): Promise<{ chunksStored: number }>;

  deleteByFileId(fileId: string, tenantId: string): Promise<void>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
