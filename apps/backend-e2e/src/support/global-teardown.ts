import { Client } from 'pg';

const TEST_DB_PORT = 5434;
const TEST_DB_NAME = 'files_assistant_test';

export default async function globalTeardown(): Promise<void> {
  console.log('\n[E2E] Running global teardown...');

  try {
    const client = new Client({
      host: 'localhost',
      port: TEST_DB_PORT,
      database: TEST_DB_NAME,
      user: 'postgres',
      password: 'postgres',
    });
    await client.connect();
    await client.query('TRUNCATE TABLE "chunks" CASCADE');
    await client.query('TRUNCATE TABLE "files" CASCADE');
    await client.end();
    console.log('[E2E] Test tables truncated');
  } catch (err) {
    console.warn('[E2E] Teardown warning:', err instanceof Error ? err.message : err);
  }

  console.log('[E2E] Global teardown complete\n');
}
