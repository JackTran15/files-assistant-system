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

export interface ChatResponseSource {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  content?: string;
}

export function createChatResponseEvent(
  params: Omit<ChatResponseEvent, 'timestamp'>,
): ChatResponseEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
