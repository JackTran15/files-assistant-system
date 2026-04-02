import 'multer';
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable } from 'rxjs';
import { FileEntity } from './entities/file.entity';
import { ChunkEntity } from './entities/chunk.entity';
import { SearchFilesDto } from './dto/search-files.dto';
import { FileStatus, FileType } from '@files-assistant/core';
import { KafkaProducerService } from '../kafka/kafka.producer';
import { createFileUploadedEvent } from '@files-assistant/events';
import { ChunkLookupService } from './chunk-lookup.service';

export interface FileStatusEvent {
  fileId: string;
  status: string;
  error?: string;
  timestamp?: string;
}

const VALID_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  [FileStatus.PENDING]: [FileStatus.PROCESSING],
  [FileStatus.PROCESSING]: [FileStatus.EXTRACTING, FileStatus.FAILED],
  [FileStatus.EXTRACTING]: [FileStatus.EXTRACTED, FileStatus.FAILED],
  [FileStatus.EXTRACTED]: [FileStatus.EMBEDDING, FileStatus.READY, FileStatus.FAILED],
  [FileStatus.EMBEDDING]: [FileStatus.READY, FileStatus.FAILED],
  [FileStatus.READY]: [],
  [FileStatus.FAILED]: [FileStatus.PROCESSING],
};

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
    private readonly chunkLookupService: ChunkLookupService,
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

  private static readonly NON_RETRYABLE_STATUSES: FileStatus[] = [
    FileStatus.PROCESSING,
    FileStatus.EXTRACTING,
    FileStatus.EXTRACTED,
    FileStatus.EMBEDDING,
  ];

  async retry(fileId: string): Promise<FileEntity> {
    const file = await this.findOne(fileId);

    if (FilesService.NON_RETRYABLE_STATUSES.includes(file.status)) {
      throw new ConflictException(
        `Cannot retry file while it is ${file.status}`,
      );
    }

    await this.fileRepo
      .createQueryBuilder()
      .update(FileEntity)
      .set({
        status: FileStatus.PROCESSING,
        chunkCount: 0,
        errorMessage: () => 'NULL',
        errorStage: () => 'NULL',
        parsedText: () => 'NULL',
        extractionMethod: () => 'NULL',
      })
      .where('id = :id', { id: file.id })
      .execute();
    this.emitStatusEvent(file.id, FileStatus.PROCESSING);

    try {
      await this.kafkaProducer.publish(
        'file.uploaded',
        file.tenantId,
        createFileUploadedEvent({
          fileId: file.id,
          tenantId: file.tenantId,
          fileName: file.name,
          mimeType: file.mimeType,
          storagePath: file.storagePath,
          size: Number(file.size),
        }),
      );
    } catch (error) {
      this.logger.error(
        `Kafka publish failed for retry ${file.id}, restoring previous status`,
        error instanceof Error ? error.stack : error,
      );
      await this.fileRepo.update(file.id, {
        status: file.status,
        chunkCount: file.chunkCount,
        errorMessage: file.errorMessage ?? undefined,
        errorStage: file.errorStage ?? undefined,
        parsedText: file.parsedText ?? undefined,
        extractionMethod: file.extractionMethod ?? undefined,
      });
      throw error;
    }

    return (await this.findOne(file.id));
  }

  async updateStatus(
    fileId: string,
    status: FileStatus,
    extra?: { chunkCount?: number; errorMessage?: string; errorStage?: string },
  ): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId }, select: ['id', 'status'] });
    if (file) {
      const allowed = VALID_TRANSITIONS[file.status] ?? [];
      if (!allowed.includes(status)) {
        throw new ConflictException(
          `Invalid status transition for file ${fileId}: ${file.status} → ${status}`,
        );
      }
    }

    const updatePayload: Record<string, unknown> = { status };

    if (extra?.chunkCount !== undefined) updatePayload.chunkCount = extra.chunkCount;
    if (extra?.errorMessage !== undefined) updatePayload.errorMessage = extra.errorMessage;
    if (extra?.errorStage !== undefined) updatePayload.errorStage = extra.errorStage;

    await this.fileRepo.update(fileId, updatePayload);

    this.emitStatusEvent(fileId, status, extra?.errorMessage);
  }

  async saveExtractedText(fileId: string, data: {
    parsedText: string;
    extractionMethod: 'haiku' | 'raw';
    characterCount: number;
    pageCount?: number;
  }): Promise<void> {
    const result = await this.fileRepo.update(fileId, {
      parsedText: data.parsedText,
      extractionMethod: data.extractionMethod,
      status: FileStatus.EXTRACTED,
    });

    if (result.affected === 0) {
      this.logger.warn(`saveExtractedText: file ${fileId} not found, skipping`);
      return;
    }

    this.emitStatusEvent(fileId, FileStatus.EXTRACTED);
  }

  private emitStatusEvent(fileId: string, status: FileStatus, error?: string): void {
    const subject = this.fileStatusStreams.get(fileId);
    if (subject) {
      subject.next({ fileId, status, error, timestamp: new Date().toISOString() });

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

  async findChunk(fileId: string, chunkIndex: number): Promise<{
    fileId: string;
    chunkIndex: number;
    content: string;
  }> {
    const file = await this.findOne(fileId);
    return this.chunkLookupService.findChunk(fileId, file.tenantId, chunkIndex);
  }

  private static readonly NON_DELETABLE_STATUSES: FileStatus[] = [
    FileStatus.PROCESSING,
    FileStatus.EXTRACTING,
    FileStatus.EXTRACTED,
    FileStatus.EMBEDDING,
  ];

  async remove(id: string): Promise<void> {
    const file = await this.findOne(id);
    if (FilesService.NON_DELETABLE_STATUSES.includes(file.status)) {
      throw new ConflictException(
        `Cannot delete file while it is ${file.status}`,
      );
    }
    await this.chunkRepo.delete({ fileId: file.id });
    await this.fileRepo.remove(file);
  }

  private resolveFileType(mimeType: string): FileType {
    if (mimeType === 'application/pdf') return FileType.PDF;
    if (mimeType === 'application/json') return FileType.JSON;
    if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown')
      return FileType.MARKDOWN;
    return FileType.TXT;
  }
}
