export const TOPICS = {
  FILE_UPLOADED: 'file.uploaded',
  FILE_READY: 'file.ready',
  FILE_FAILED: 'file.failed',
  FILE_EXTRACTED: 'file.extracted',
  CHAT_REQUEST: 'chat.request',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const CONSUMER_GROUPS = {
  AGENT_INGESTION: 'agent-ingest-workers',
  AGENT_CHAT: 'agent-chat-workers',
  BACKEND_NOTIFICATIONS: 'backend-notifications',
  BACKEND_CHAT_REPLY: 'backend-chat-reply',
} as const;

export const DLQ_TOPICS = {
  FILE_UPLOADED: 'dlq.file.uploaded',
  FILE_EXTRACTED: 'dlq.file.extracted',
  CHAT_REQUEST: 'dlq.chat.request',
} as const;

export const TOPIC_KEYS = {
  [TOPICS.CHAT_REQUEST]: 'correlationId',
  [TOPICS.FILE_UPLOADED]: 'fileId',
  [TOPICS.FILE_READY]: 'fileId',
  [TOPICS.FILE_FAILED]: 'fileId',
  [TOPICS.FILE_EXTRACTED]: 'fileId',
  [DLQ_TOPICS.CHAT_REQUEST]: 'correlationId',
  [DLQ_TOPICS.FILE_UPLOADED]: 'fileId',
  [DLQ_TOPICS.FILE_EXTRACTED]: 'fileId',
} as const;

export const TOPIC_PARTITIONS = {
  [TOPICS.CHAT_REQUEST]: 12,
  [TOPICS.FILE_UPLOADED]: 24,
  [TOPICS.FILE_READY]: 12,
  [TOPICS.FILE_FAILED]: 12,
  [TOPICS.FILE_EXTRACTED]: 12,
  [DLQ_TOPICS.CHAT_REQUEST]: 6,
  [DLQ_TOPICS.FILE_UPLOADED]: 6,
  [DLQ_TOPICS.FILE_EXTRACTED]: 6,
} as const;
