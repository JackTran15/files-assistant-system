export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  evidence?: ChatEvidence[];
  claims?: ChatClaim[];
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
  score: number;
  excerpt?: string;
  pageNumber?: number;
  citationContent?: string;
}

export interface ChatEvidence {
  evidenceId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  citationContent?: string;
}

export interface ChatClaim {
  claimText: string;
  evidenceIds: string[];
}

export interface ConversationMetadata {
  id: string;
  title?: string;
  tenantId: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}
