import { join } from 'path';
import { TestContext } from './support/app-bootstrap';
import { getSharedContext, releaseSharedContext } from './support/shared-context';
import { cleanDatabase, destroyTestDataSource, getFileFromDb } from './support/db-helpers';
import { waitForFileStatus } from './support/polling';

const FIXTURES = join(__dirname, 'fixtures');

describe('Ingestion — Failure Scenarios', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await getSharedContext();
  });

  afterAll(async () => {
    await releaseSharedContext();
    await destroyTestDataSource();
  });

  beforeEach(async () => {
    await cleanDatabase();
    ctx.mockAnthropic.reset();
    ctx.mockEmbedding.reset();
  });

  describe('Corrupt PDF', () => {
    it('results in FAILED status with errorStage: extraction', async () => {
      ctx.mockAnthropic.setFailMode(true);

      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'corrupt.pdf'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'failed', 30000);

      expect(file.status).toBe('failed');
      expect(file.errorStage).toBe('extraction');
      expect(file.errorMessage).toBeDefined();
      expect(typeof file.errorMessage).toBe('string');
    });
  });

  describe('Embedding error', () => {
    it('extraction succeeds but embedding fails — parsedText is persisted', async () => {
      ctx.mockEmbedding.shouldFail = true;

      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'test.txt'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'failed', 30000);

      expect(file.status).toBe('failed');
      expect(file.errorStage).toBe('embedding');

      const dbFile = await getFileFromDb(fileId);
      expect(dbFile).not.toBeNull();
      expect(dbFile!.parsedText).toBeTruthy();
      expect(dbFile!.extractionMethod).toBe('raw');
    });
  });

  describe('Empty file', () => {
    it('results in FAILED status', async () => {
      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'empty.txt'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'failed', 30000);

      expect(file.status).toBe('failed');
    });
  });
});
