import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

export interface CapturedKafkaMessage {
  topic: string;
  key: string | null;
  value: Record<string, unknown>;
  timestamp: string;
  offset: string;
}

const TEST_BROKER = 'localhost:19092';

let consumer: Consumer | null = null;
let capturedMessages: CapturedKafkaMessage[] = [];

export async function startKafkaVerifier(): Promise<void> {
  const kafka = new Kafka({
    clientId: 'e2e-verifier',
    brokers: [TEST_BROKER],
  });

  consumer = kafka.consumer({ groupId: 'e2e-verifier-' + Date.now() });
  await consumer.connect();
  await consumer.subscribe({
    topics: ['file.uploaded', 'file.extracted', 'file.ready', 'file.failed'],
    fromBeginning: false,
  });

  capturedMessages = [];

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) return;
      capturedMessages.push({
        topic,
        key: message.key?.toString() ?? null,
        value: JSON.parse(message.value.toString()),
        timestamp: message.timestamp,
        offset: message.offset,
      });
    },
  });
}

export async function stopKafkaVerifier(): Promise<void> {
  if (consumer) {
    await consumer.disconnect().catch(() => {/* ignore */});
    consumer = null;
  }
}

export function getCapturedMessages(): CapturedKafkaMessage[] {
  return [...capturedMessages];
}

export function getMessagesForFile(fileId: string): CapturedKafkaMessage[] {
  return capturedMessages.filter(
    (m) => m.key === fileId || m.value.fileId === fileId,
  );
}

export function clearCapturedMessages(): void {
  capturedMessages = [];
}

export async function waitForKafkaMessage(
  topic: string,
  predicate: (msg: CapturedKafkaMessage) => boolean,
  timeoutMs = 30000,
): Promise<CapturedKafkaMessage> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const match = capturedMessages.find(
      (m) => m.topic === topic && predicate(m),
    );
    if (match) return match;
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(
    `Timed out waiting for message on topic "${topic}" after ${timeoutMs}ms. ` +
    `Captured ${capturedMessages.length} total messages.`,
  );
}
