import { join } from 'path';
import { TestContext } from './support/app-bootstrap';
import { getSharedContext, releaseSharedContext } from './support/shared-context';
import { cleanDatabase, destroyTestDataSource } from './support/db-helpers';
import { waitForFileStatus } from './support/polling';
import {
  startKafkaVerifier,
  stopKafkaVerifier,
  getMessagesForFile,
  clearCapturedMessages,
  waitForKafkaMessage,
} from './support/kafka-helpers';

const FIXTURES = join(__dirname, 'fixtures');

describe('Ingestion — Kafka Event Verification', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await getSharedContext();
    await startKafkaVerifier();
  });

  afterAll(async () => {
    await stopKafkaVerifier();
    await releaseSharedContext();
    await destroyTestDataSource();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clearCapturedMessages();
    ctx.mockAnthropic.reset();
    ctx.mockEmbedding.reset();
  });

  it('PDF upload produces file.uploaded → file.extracted → file.ready in order', async () => {
    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'test.pdf'));

    const fileId = uploadRes.body.id;

    await waitForFileStatus(ctx.httpServer, fileId, 'ready', 30000);

    await waitForKafkaMessage(
      'file.ready',
      (m) => m.value.fileId === fileId,
      10000,
    );

    const messages = getMessagesForFile(fileId);
    const topics = messages.map((m) => m.topic);

    expect(topics).toContain('file.uploaded');
    expect(topics).toContain('file.extracted');
    expect(topics).toContain('file.ready');

    const uploadedIdx = topics.indexOf('file.uploaded');
    const extractedIdx = topics.indexOf('file.extracted');
    const readyIdx = topics.indexOf('file.ready');

    expect(uploadedIdx).toBeLessThan(extractedIdx);
    expect(extractedIdx).toBeLessThan(readyIdx);

    const extractedMsg = messages.find((m) => m.topic === 'file.extracted');
    expect(extractedMsg!.value.parsedText).toBeDefined();
    expect(extractedMsg!.value.extractionMethod).toBe('haiku');

    const readyMsg = messages.find((m) => m.topic === 'file.ready');
    expect(Number(readyMsg!.value.chunksCreated)).toBeGreaterThan(0);
  });

  it('Corrupt PDF produces file.uploaded → file.failed with stage: extraction', async () => {
    ctx.mockAnthropic.setFailMode(true);

    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'corrupt.pdf'));

    const fileId = uploadRes.body.id;

    await waitForFileStatus(ctx.httpServer, fileId, 'failed', 30000);

    await waitForKafkaMessage(
      'file.failed',
      (m) => m.value.fileId === fileId,
      10000,
    );

    const messages = getMessagesForFile(fileId);
    const topics = messages.map((m) => m.topic);

    expect(topics).toContain('file.uploaded');
    expect(topics).toContain('file.failed');
    expect(topics).not.toContain('file.extracted');
    expect(topics).not.toContain('file.ready');

    const failedMsg = messages.find((m) => m.topic === 'file.failed');
    expect(failedMsg!.value.stage).toBe('extraction');
    expect(failedMsg!.value.error).toBeDefined();
  });

  it('TXT upload with embedding failure produces file.extracted AND file.failed', async () => {
    ctx.mockEmbedding.shouldFail = true;

    const uploadRes = await ctx.request
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'test.txt'));

    const fileId = uploadRes.body.id;

    await waitForFileStatus(ctx.httpServer, fileId, 'failed', 30000);

    await waitForKafkaMessage(
      'file.failed',
      (m) => m.value.fileId === fileId,
      10000,
    );

    const messages = getMessagesForFile(fileId);
    const topics = messages.map((m) => m.topic);

    expect(topics).toContain('file.uploaded');
    expect(topics).toContain('file.extracted');
    expect(topics).toContain('file.failed');
    expect(topics).not.toContain('file.ready');

    const failedMsg = messages.find((m) => m.topic === 'file.failed');
    expect(failedMsg!.value.stage).toBe('embedding');
  });
});
