export const TOPICS = {
  FILE_UPLOADED: 'file.uploaded',
  FILE_READY: 'file.ready',
  FILE_FAILED: 'file.failed',
  CHAT_REQUEST: 'chat.request',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const CONSUMER_GROUPS = {
  AGENT_INGESTION: 'agent-ingestion',
  AGENT_CHAT: 'agent-chat',
  BACKEND_NOTIFICATIONS: 'backend-notifications',
  BACKEND_CHAT_REPLY: 'backend-chat-reply',
} as const;

export const DLQ_TOPICS = {
  FILE_UPLOADED: 'dlq.file.uploaded',
  CHAT_REQUEST: 'dlq.chat.request',
} as const;
