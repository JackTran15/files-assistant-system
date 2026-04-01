import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStatus } from '@files-assistant/core';

@Injectable()
export class PostgresAdapter {
  constructor(private readonly config: ConfigService) {}

  async updateFileStatus(
    fileId: string,
    status: FileStatus,
    chunkCount?: number,
  ): Promise<void> {
    // TODO: implement direct PG query or TypeORM connection for status updates
  }
}
