import { join } from 'path';
import { TestContext } from './support/app-bootstrap';
import { getSharedContext, releaseSharedContext } from './support/shared-context';
import { cleanDatabase, destroyTestDataSource } from './support/db-helpers';
import { connectSse } from './support/sse-helpers';

const FIXTURES = join(__dirname, 'fixtures');

describe('Ingestion — SSE Event Stream', () => {
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

  it('delivers status events in order for a successful upload', async () => {
    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'test.txt'));

    expect(uploadRes.status).toBe(202);
    const fileId = uploadRes.body.id;

    const sse = await connectSse(ctx.httpServer, fileId);

    try {
      await sse.waitForEvent((e) => e.status === 'ready', 30000);

      const statuses = sse.events.map((e) => e.status);
      const extractedIdx = statuses.indexOf('extracted');
      const readyIdx = statuses.indexOf('ready');

      expect(extractedIdx).toBeGreaterThanOrEqual(0);
      expect(readyIdx).toBeGreaterThan(extractedIdx);
    } finally {
      sse.close();
    }
  });

  it('SSE stream closes after terminal status (ready)', async () => {
    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'test.txt'));

    const fileId = uploadRes.body.id;
    const sse = await connectSse(ctx.httpServer, fileId);

    try {
      await sse.waitForEvent((e) => e.status === 'ready', 30000);
      await sse.waitForClose(5000);
      expect(sse.closed).toBe(true);
    } finally {
      sse.close();
    }
  });

  it('SSE stream closes after terminal status (failed)', async () => {
    ctx.mockAnthropic.setFailMode(true);

    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'corrupt.pdf'));

    const fileId = uploadRes.body.id;
    const sse = await connectSse(ctx.httpServer, fileId);

    try {
      await sse.waitForEvent((e) => e.status === 'failed', 30000);
      await sse.waitForClose(5000);
      expect(sse.closed).toBe(true);

      const failEvent = sse.events.find((e) => e.status === 'failed');
      expect(failEvent).toBeDefined();
      expect(failEvent!.error).toBeDefined();
    } finally {
      sse.close();
    }
  });
});
