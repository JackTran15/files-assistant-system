import { DataSource } from 'typeorm';

const TEST_DB_PORT = 5434;
const TEST_DB_NAME = 'files_assistant_test';

let dataSource: DataSource | null = null;

export async function getTestDataSource(): Promise<DataSource> {
  if (dataSource && dataSource.isInitialized) return dataSource;

  dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: TEST_DB_PORT,
    database: TEST_DB_NAME,
    username: 'postgres',
    password: 'postgres',
  });

  await dataSource.initialize();
  return dataSource;
}

export async function cleanDatabase(): Promise<void> {
  const ds = await getTestDataSource();
  await ds.query('TRUNCATE TABLE "chunks" CASCADE');
  await ds.query('TRUNCATE TABLE "files" CASCADE');
}

export async function getFileFromDb(fileId: string): Promise<Record<string, unknown> | null> {
  const ds = await getTestDataSource();
  const rows = await ds.query('SELECT * FROM "files" WHERE id = $1', [fileId]);
  return rows[0] ?? null;
}

export async function destroyTestDataSource(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
  }
}
