import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PORT } from '@files-assistant/core';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const storageType = config.get<string>('STORAGE_TYPE', 'local');
        return storageType === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter(config);
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
