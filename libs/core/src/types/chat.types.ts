export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  createdAt: Date;
}

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface ChatSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
  excerpt?: string;
  pageNumber?: number;
}

export interface ConversationMetadata {
  id: string;
  title?: string;
  tenantId: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}
