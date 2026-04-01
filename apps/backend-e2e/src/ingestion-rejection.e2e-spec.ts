import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../../../apps/backend/src/app/app.module';

const FIXTURES = join(__dirname, 'fixtures');

describe('Ingestion — File Rejection (400)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects DOCX upload with 400', async () => {
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', join(FIXTURES, 'test.docx'));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/[Uu]nsupported file type/);
  });

  it('rejects MP4 upload with 400', async () => {
    const fakeBuffer = Buffer.from('fake-mp4-content');
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', fakeBuffer, { filename: 'test.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(400);
  });

  it('rejects CSV upload with 400', async () => {
    const csvContent = Buffer.from('col1,col2\nval1,val2');
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', csvContent, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
  });

  it('rejects XLSX upload with 400', async () => {
    const fakeBuffer = Buffer.from('fake-xlsx-content');
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', fakeBuffer, {
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(res.status).toBe(400);
  });

  it('rejects EXE upload with 400', async () => {
    const fakeBuffer = Buffer.from('MZ-fake-exe');
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant')
      .attach('file', fakeBuffer, {
        filename: 'test.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
  });

  it('rejects upload with no file attached with 400', async () => {
    const res = await request(httpServer)
      .post('/api/files/upload')
      .field('tenantId', 'test-tenant');

    expect(res.status).toBe(400);
  });
});
