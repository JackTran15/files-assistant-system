import { Readable } from 'stream';

export interface StoragePort {
  save(
    fileName: string,
    data: Buffer | Readable,
    tenantId: string,
  ): Promise<string>;

  read(storagePath: string): Promise<Buffer>;

  delete(storagePath: string): Promise<void>;

  exists(storagePath: string): Promise<boolean>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
