export interface ChatResponseEvent {
  correlationId: string;
  conversationId: string;
  chunk: string;
  done: boolean;
  cancelled?: boolean;
  sources?: ChatResponseSource[];
  evidence?: ChatResponseEvidence[];
  claims?: ChatResponseClaim[];
  renderedAnswer?: string;
  citationWarnings?: string[];
  confidenceScore?: number;
  revision?: number;
  timestamp: string;
}

export interface ChatResponseSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  citationContent?: string;
}

export interface ChatResponseEvidence {
  evidenceId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  citationContent?: string;
}

export interface ChatResponseClaim {
  claimText: string;
  evidenceIds: string[];
}

export function createChatResponseEvent(
  params: Omit<ChatResponseEvent, 'timestamp'>,
): ChatResponseEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
