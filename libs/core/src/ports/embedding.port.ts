import { ChunkMetadata } from '../types/file.types';
import { EmbeddingResult } from '../types/agent.types';

export interface EmbeddingPort {
  embedAndStore(
    chunks: string[],
    metadata: ChunkMetadata[],
    tenantId: string,
  ): Promise<EmbeddingResult>;

  deleteByFileId(fileId: string, tenantId: string): Promise<void>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
