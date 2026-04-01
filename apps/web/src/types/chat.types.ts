export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface ChatResponseSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  content?: string;
}

export interface ChatResponseEvent {
  correlationId: string;
  conversationId: string;
  chunk: string;
  done: boolean;
  cancelled?: boolean;
  sources?: ChatResponseSource[];
  confidenceScore?: number;
  revision?: number;
  timestamp: string;
}

export interface TextPart {
  type: 'text';
  content: string;
}

export interface CitationRefPart {
  type: 'citation-ref';
  refIndex: number;
  sourceId?: string;
}

export type MessagePart = TextPart | CitationRefPart;

export interface Message {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  sources?: ChatResponseSource[];
  confidenceScore?: number;
  parts?: MessagePart[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  tenantId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageResponse {
  correlationId: string;
  conversationId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}
