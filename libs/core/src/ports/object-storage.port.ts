import { Readable } from 'stream';

/** Blob/object storage (S3, local disk) — distinct from vector/chunk storage in Weaviate. */
export interface ObjectStoragePort {
  save(
    fileName: string,
    data: Buffer | Readable,
    tenantId: string,
  ): Promise<string>;

  read(storagePath: string): Promise<Buffer>;

  delete(storagePath: string): Promise<void>;

  exists(storagePath: string): Promise<boolean>;
}

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');
