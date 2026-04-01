import 'multer';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable } from 'rxjs';
import { FileEntity } from './entities/file.entity';
import { ChunkEntity } from './entities/chunk.entity';
import { SearchFilesDto } from './dto/search-files.dto';
import { FileStatus, FileType } from '@files-assistant/core';
import { KafkaProducerService } from '../kafka/kafka.producer';
import { createFileUploadedEvent } from '@files-assistant/events';

export interface FileStatusEvent {
  fileId: string;
  status: string;
  error?: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly fileStatusStreams = new Map<string, Subject<FileStatusEvent>>();

  constructor(
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    @InjectRepository(ChunkEntity)
    private readonly chunkRepo: Repository<ChunkEntity>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async upload(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<FileEntity> {
    const fileType = this.resolveFileType(file.mimetype);

    const entity = this.fileRepo.create({
      name: file.originalname,
      mimeType: file.mimetype,
      fileType,
      size: file.size,
      status: FileStatus.PROCESSING,
      storagePath: file.path,
      tenantId,
    });

    const saved = await this.fileRepo.save(entity);

    try {
      await this.kafkaProducer.publish(
        'file.uploaded',
        tenantId,
        createFileUploadedEvent({
          fileId: saved.id,
          tenantId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          storagePath: file.path,
          size: file.size,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Kafka publish failed for file ${saved.id}, rolling back DB insert`,
        error instanceof Error ? error.stack : error,
      );
      await this.fileRepo.remove(saved);
      throw error;
    }

    return saved;
  }

  async updateStatus(
    fileId: string,
    status: FileStatus,
    extra?: { chunkCount?: number; errorMessage?: string; errorStage?: string },
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = { status };

    if (extra?.chunkCount !== undefined) updatePayload.chunkCount = extra.chunkCount;
    if (extra?.errorMessage !== undefined) updatePayload.errorMessage = extra.errorMessage;
    if (extra?.errorStage !== undefined) updatePayload.errorStage = extra.errorStage;

    await this.fileRepo.update(fileId, updatePayload);

    const subject = this.fileStatusStreams.get(fileId);
    if (subject) {
      subject.next({
        fileId,
        status,
        error: extra?.errorMessage,
      });

      if (status === FileStatus.READY || status === FileStatus.FAILED) {
        subject.complete();
        this.fileStatusStreams.delete(fileId);
      }
    }
  }

  getFileStatusStream(fileId: string): Observable<FileStatusEvent> {
    if (!this.fileStatusStreams.has(fileId)) {
      this.fileStatusStreams.set(fileId, new Subject<FileStatusEvent>());
    }
    return this.fileStatusStreams.get(fileId)!.asObservable();
  }

  async findAll(query: SearchFilesDto) {
    const { tenantId, status, page = 1, limit = 20 } = query;

    const qb = this.fileRepo.createQueryBuilder('file');

    if (tenantId) qb.andWhere('file.tenantId = :tenantId', { tenantId });
    if (status) qb.andWhere('file.status = :status', { status });

    qb.orderBy('file.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<FileEntity> {
    const file = await this.fileRepo.findOne({ where: { id } });
    if (!file) throw new NotFoundException(`File ${id} not found`);
    return file;
  }

  async remove(id: string): Promise<void> {
    const file = await this.findOne(id);
    await this.chunkRepo.delete({ fileId: file.id });
    await this.fileRepo.remove(file);
  }

  private resolveFileType(mimeType: string): FileType {
    if (mimeType === 'application/pdf') return FileType.PDF;
    if (mimeType.includes('wordprocessingml')) return FileType.DOCX;
    return FileType.TXT;
  }
}
