import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilesService, FileStatusEvent } from './files.service';
import { FileEntity } from './entities/file.entity';
import { ChunkEntity } from './entities/chunk.entity';
import { KafkaProducerService } from '../kafka/kafka.producer';
import { FileStatus } from '@files-assistant/core';

describe('FilesService', () => {
  let service: FilesService;
  let fileRepo: Record<string, jest.Mock>;
  let chunkRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    fileRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    chunkRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(FileEntity), useValue: fileRepo },
        { provide: getRepositoryToken(ChunkEntity), useValue: chunkRepo },
        { provide: KafkaProducerService, useValue: {} },
      ],
    }).compile();

    service = module.get(FilesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── updateStatus DB writes ────────────────────────────────────────

  it('updateStatus to EXTRACTING updates DB', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.PROCESSING } as FileEntity);

    await service.updateStatus('f-1', FileStatus.EXTRACTING);

    expect(fileRepo.update).toHaveBeenCalledWith('f-1', { status: FileStatus.EXTRACTING });
  });

  it('updateStatus to EXTRACTED updates DB', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.EXTRACTING } as FileEntity);

    await service.updateStatus('f-1', FileStatus.EXTRACTED);

    expect(fileRepo.update).toHaveBeenCalledWith('f-1', { status: FileStatus.EXTRACTED });
  });

  it('updateStatus to EMBEDDING updates DB', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.EXTRACTED } as FileEntity);

    await service.updateStatus('f-1', FileStatus.EMBEDDING);

    expect(fileRepo.update).toHaveBeenCalledWith('f-1', { status: FileStatus.EMBEDDING });
  });

  // ── SSE intermediate statuses keep stream open ────────────────────

  it('SSE emits on EXTRACTING and stream stays open', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.PROCESSING } as FileEntity);

    const events: FileStatusEvent[] = [];
    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      next: (e) => events.push(e),
      complete: () => { completed = true; },
    });

    await service.updateStatus('f-1', FileStatus.EXTRACTING);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(FileStatus.EXTRACTING);
    expect(events[0].timestamp).toBeDefined();
    expect(completed).toBe(false);
  });

  it('SSE emits on EXTRACTED and stream stays open', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.EXTRACTING } as FileEntity);

    const events: FileStatusEvent[] = [];
    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      next: (e) => events.push(e),
      complete: () => { completed = true; },
    });

    await service.updateStatus('f-1', FileStatus.EXTRACTED);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(FileStatus.EXTRACTED);
    expect(completed).toBe(false);
  });

  it('SSE emits on EMBEDDING and stream stays open', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.EXTRACTED } as FileEntity);

    const events: FileStatusEvent[] = [];
    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      next: (e) => events.push(e),
      complete: () => { completed = true; },
    });

    await service.updateStatus('f-1', FileStatus.EMBEDDING);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(FileStatus.EMBEDDING);
    expect(completed).toBe(false);
  });

  // ── SSE completes on terminal statuses ────────────────────────────

  it('SSE completes on READY', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.EMBEDDING } as FileEntity);

    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      complete: () => { completed = true; },
    });

    await service.updateStatus('f-1', FileStatus.READY);

    expect(completed).toBe(true);
  });

  it('SSE completes on FAILED', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.PROCESSING } as FileEntity);

    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      complete: () => { completed = true; },
    });

    await service.updateStatus('f-1', FileStatus.FAILED, { errorMessage: 'boom' });

    expect(completed).toBe(true);
  });

  // ── Full status progression ───────────────────────────────────────

  it('full status progression via SSE', async () => {
    const events: FileStatusEvent[] = [];
    let completed = false;

    service.getFileStatusStream('f-1').subscribe({
      next: (e) => events.push(e),
      complete: () => { completed = true; },
    });

    const progression: [FileStatus, FileStatus][] = [
      [FileStatus.PROCESSING, FileStatus.EXTRACTING],
      [FileStatus.EXTRACTING, FileStatus.EXTRACTED],
      [FileStatus.EXTRACTED, FileStatus.EMBEDDING],
      [FileStatus.EMBEDDING, FileStatus.READY],
    ];

    for (const [currentStatus, nextStatus] of progression) {
      fileRepo.findOne.mockResolvedValueOnce({ id: 'f-1', status: currentStatus } as FileEntity);
      await service.updateStatus('f-1', nextStatus);
    }

    expect(events).toHaveLength(4);
    expect(events.map((e) => e.status)).toEqual([
      FileStatus.EXTRACTING,
      FileStatus.EXTRACTED,
      FileStatus.EMBEDDING,
      FileStatus.READY,
    ]);
    expect(completed).toBe(true);
  });

  // ── Invalid transition handling ────────────────────────────────────

  it('invalid transition throws conflict exception', async () => {
    fileRepo.findOne.mockResolvedValue({ id: 'f-1', status: FileStatus.READY } as FileEntity);

    await expect(
      service.updateStatus('f-1', FileStatus.PROCESSING),
    ).rejects.toThrow('Invalid status transition');
    expect(fileRepo.update).not.toHaveBeenCalledWith('f-1', {
      status: FileStatus.PROCESSING,
    });
  });

  // ── findAll with status filter ────────────────────────────────────

  it('findAll with status=extracted returns filtered results', async () => {
    const mockQb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [{ id: 'f-1', status: FileStatus.EXTRACTED }],
        1,
      ]),
    };
    (fileRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

    const result = await service.findAll({ status: FileStatus.EXTRACTED });

    expect(mockQb.andWhere).toHaveBeenCalledWith('file.status = :status', {
      status: FileStatus.EXTRACTED,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe(FileStatus.EXTRACTED);
  });

  it('findChunk returns full chunk content for a file', async () => {
    chunkRepo.findOne.mockResolvedValue({
      fileId: 'f-1',
      index: 3,
      content: 'Full chunk content',
    });

    const result = await service.findChunk('f-1', 3);

    expect(chunkRepo.findOne).toHaveBeenCalledWith({
      where: { fileId: 'f-1', index: 3 },
      select: ['fileId', 'index', 'content'],
    });
    expect(result).toEqual({
      fileId: 'f-1',
      chunkIndex: 3,
      content: 'Full chunk content',
    });
  });
});
