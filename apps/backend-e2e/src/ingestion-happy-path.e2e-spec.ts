import { join } from 'path';
import * as fs from 'fs';
import { TestContext } from './support/app-bootstrap';
import { getSharedContext, releaseSharedContext } from './support/shared-context';
import { cleanDatabase, destroyTestDataSource } from './support/db-helpers';
import { waitForFileStatus } from './support/polling';
import { getExpectedPdfText } from './support/mock-anthropic';

const FIXTURES = join(__dirname, 'fixtures');

describe('Ingestion — Happy Path', () => {
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

  describe('PDF file', () => {
    it('completes full pipeline: upload → PROCESSING → EXTRACTED → READY', async () => {
      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'test.pdf'));

      expect(uploadRes.status).toBe(202);
      expect(uploadRes.body.id).toBeDefined();

      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'ready', 30000);

      expect(file.status).toBe('ready');
      expect(file.extractionMethod).toBe('haiku');
      expect(file.parsedText).toBe(getExpectedPdfText());
      expect(Number(file.chunkCount)).toBeGreaterThan(0);
    });
  });

  describe('TXT file', () => {
    it('completes full pipeline with extractionMethod: raw', async () => {
      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'test.txt'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'ready', 30000);
      const expectedContent = fs.readFileSync(join(FIXTURES, 'test.txt'), 'utf-8');

      expect(file.status).toBe('ready');
      expect(file.extractionMethod).toBe('raw');
      expect(file.parsedText).toBe(expectedContent);
      expect(Number(file.chunkCount)).toBeGreaterThan(0);
    });
  });

  describe('MD file', () => {
    it('completes full pipeline preserving markdown syntax', async () => {
      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'test.md'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'ready', 30000);
      const expectedContent = fs.readFileSync(join(FIXTURES, 'test.md'), 'utf-8');

      expect(file.status).toBe('ready');
      expect(file.extractionMethod).toBe('raw');
      expect(file.parsedText).toBe(expectedContent);
      expect(file.parsedText).toContain('# Test Document');
      expect(file.parsedText).toContain('- Headings at multiple levels');
    });
  });

  describe('JSON file', () => {
    it('completes full pipeline with valid JSON in parsedText', async () => {
      const uploadRes = await ctx.request
        .post('/api/files/upload')
        .field('tenantId', 'test-tenant')
        .attach('file', join(FIXTURES, 'test.json'));

      expect(uploadRes.status).toBe(202);
      const fileId = uploadRes.body.id;

      const file = await waitForFileStatus(ctx.httpServer, fileId, 'ready', 30000);

      expect(file.status).toBe('ready');
      expect(file.extractionMethod).toBe('raw');
      expect(() => JSON.parse(file.parsedText as string)).not.toThrow();

      const parsed = JSON.parse(file.parsedText as string);
      expect(parsed.name).toBe('Test Document');
    });
  });
});
