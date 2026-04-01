import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStoragePort } from '@files-assistant/core';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class LocalStorageAdapter implements ObjectStoragePort {
  private basePath: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = this.config.get<string>('STORAGE_LOCAL_PATH', './uploads');
  }

  async save(fileName: string, data: Buffer | Readable, tenantId: string): Promise<string> {
    const dir = path.join(this.basePath, tenantId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, fileName);

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(filePath, data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    }

    return filePath;
  }

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(storagePath).catch(() => {});
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }
}
