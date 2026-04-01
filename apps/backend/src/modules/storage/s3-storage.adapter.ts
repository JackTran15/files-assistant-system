import { Injectable } from '@nestjs/common';
import { StoragePort } from '@files-assistant/core';
import { Readable } from 'stream';

@Injectable()
export class S3StorageAdapter implements StoragePort {
  async save(_fileName: string, _data: Buffer | Readable, _tenantId: string): Promise<string> {
    // TODO: implement S3 upload
    throw new Error('S3 storage not implemented yet');
  }

  async read(_storagePath: string): Promise<Buffer> {
    throw new Error('S3 storage not implemented yet');
  }

  async delete(_storagePath: string): Promise<void> {
    throw new Error('S3 storage not implemented yet');
  }

  async exists(_storagePath: string): Promise<boolean> {
    throw new Error('S3 storage not implemented yet');
  }
}
