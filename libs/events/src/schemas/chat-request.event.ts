export interface ChatRequestEvent {
  correlationId: string;
  conversationId: string;
  tenantId: string;
  message: string;
  fileIds?: string[];
  timestamp: string;
}

export function createChatRequestEvent(
  params: Omit<ChatRequestEvent, 'timestamp'>,
): ChatRequestEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
