import { Client } from 'pg';
import { Kafka } from 'kafkajs';

const TEST_DB_PORT = 5434;
const TEST_DB_NAME = 'files_assistant_test';
const TEST_BROKER = 'localhost:19092';

async function waitForPostgres(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = new Client({
        host: 'localhost',
        port: TEST_DB_PORT,
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
      });
      await client.connect();
      await client.end();
      return;
    } catch {
      if (i === maxRetries - 1) {
        throw new Error(
          `Postgres not reachable on port ${TEST_DB_PORT} after ${maxRetries} attempts. ` +
          'Make sure test infrastructure is running: make test-e2e-infra',
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function waitForRedpanda(maxRetries = 30): Promise<void> {
  const kafka = new Kafka({ clientId: 'e2e-setup', brokers: [TEST_BROKER] });
  const admin = kafka.admin();

  for (let i = 0; i < maxRetries; i++) {
    try {
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      return;
    } catch {
      if (i === maxRetries - 1) {
        throw new Error(
          `Redpanda not reachable on ${TEST_BROKER} after ${maxRetries} attempts. ` +
          'Make sure test infrastructure is running: make test-e2e-infra',
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function ensureTestDatabase(): Promise<void> {
  const client = new Client({
    host: 'localhost',
    port: TEST_DB_PORT,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();

  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [TEST_DB_NAME],
  );

  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  }

  await client.end();
}

async function ensureKafkaTopics(): Promise<void> {
  const kafka = new Kafka({ clientId: 'e2e-setup', brokers: [TEST_BROKER] });
  const admin = kafka.admin();
  await admin.connect();

  const existing = await admin.listTopics();
  const required = ['file.uploaded', 'file.extracted', 'file.ready', 'file.failed'];
  const missing = required.filter((t) => !existing.includes(t));

  if (missing.length > 0) {
    await admin.createTopics({
      topics: missing.map((topic) => ({
        topic,
        numPartitions: 1,
        replicationFactor: 1,
      })),
    });
  }

  await admin.disconnect();
}

export default async function globalSetup(): Promise<void> {
  console.log('\n[E2E] Verifying test infrastructure...');

  await waitForPostgres();
  console.log('[E2E] Postgres is ready');

  await waitForRedpanda();
  console.log('[E2E] Redpanda is ready');

  await ensureTestDatabase();
  console.log('[E2E] Test database ensured');

  await ensureKafkaTopics();
  console.log('[E2E] Kafka topics ensured');

  console.log('[E2E] Global setup complete\n');
}
