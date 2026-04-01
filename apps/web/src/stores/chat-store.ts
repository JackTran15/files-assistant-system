import { create } from 'zustand';
import type {
  Message,
  Conversation,
  ChatResponseSource,
  ChatResponseEvent,
} from '@/types/chat.types';
import { ChatRole } from '@/types/chat.types';
import { api } from '@/lib/api';
import { createSSEConnection } from '@/lib/sse';
import { buildMessageParts } from '@/lib/parse-citations';
import {
  cleanAssistantContent,
  extractThinkingAndContent,
} from '@/lib/clean-content';

const TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'default-tenant';

interface SSEHandle {
  close: () => void;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  /** Raw accumulated SSE text (pre-cleanup). Internal bookkeeping. */
  _rawStream: string;
  streamingContent: string;
  streamingThinking: string | null;
  streamingSources: ChatResponseSource[];
  isStreaming: boolean;
  isThinking: boolean;
  error: string | null;
  activeCorrelationId: string | null;
  activeSSE: SSEHandle | null;

  sendMessage: (message: string, fileIds?: string[]) => Promise<void>;
  stopStream: () => void;
  appendStreamChunk: (chunk: string) => void;
  finalizeStream: (
    sources?: ChatResponseSource[],
    confidenceScore?: number,
  ) => void;
  loadHistory: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  clearError: () => void;
}

function normalizeSource(source: ChatResponseSource): ChatResponseSource {
  return {
    ...source,
    citationContent: source.citationContent ?? source.content,
  };
}

function normalizeSources(
  sources?: ChatResponseSource[],
): ChatResponseSource[] | undefined {
  if (!sources?.length) return undefined;
  return sources.map(normalizeSource);
}

function normalizeMessage(message: Message): Message {
  const sources = normalizeSources(message.sources);
  return {
    ...message,
    sources,
    parts:
      message.role === ChatRole.ASSISTANT
        ? buildMessageParts(message.content, sources)
        : message.parts,
  };
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map(normalizeMessage),
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  _rawStream: '',
  streamingContent: '',
  streamingThinking: null,
  streamingSources: [],
  isStreaming: false,
  isThinking: false,
  error: null,
  activeCorrelationId: null,
  activeSSE: null,

  sendMessage: async (message, fileIds) => {
    const { activeConversationId, activeCorrelationId, activeSSE } = get();

    if (activeSSE) {
      activeSSE.close();
      if (activeCorrelationId) {
        api.chat.cancel(activeCorrelationId).catch(() => {});
      }
      const partial = get().streamingContent;
      if (partial) {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: `msg-cancelled-${Date.now()}`,
              conversationId: state.activeConversationId ?? '',
              role: ChatRole.ASSISTANT,
              content: partial,
              createdAt: new Date().toISOString(),
            },
          ],
          streamingContent: '',
          streamingSources: [],
        }));
      }
    }

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId ?? '',
      role: ChatRole.USER,
      content: message,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isThinking: true,
      isStreaming: true,
      _rawStream: '',
      streamingContent: '',
      streamingThinking: null,
      streamingSources: [],
      error: null,
      activeCorrelationId: null,
      activeSSE: null,
    }));

    try {
      const { correlationId, conversationId } = await api.chat.send({
        message,
        tenantId: TENANT_ID,
        conversationId: activeConversationId ?? undefined,
        fileIds,
      });

      if (!activeConversationId) {
        set({ activeConversationId: conversationId });
      }

      const sseUrl = api.chat.streamUrl(correlationId);
      const connection = createSSEConnection(sseUrl, {
        onMessage: (data) => {
          const event = data as ChatResponseEvent;

          if (event.cancelled) {
            connection.close();
            return;
          }

          if (event.chunk) {
            get().appendStreamChunk(event.chunk);
          }

          if (event.done) {
            get().finalizeStream(event.sources, event.confidenceScore);
            connection.close();
          }
        },
        onError: () => {
          set({
            isStreaming: false,
            isThinking: false,
            error: 'Connection lost. Please try again.',
            activeCorrelationId: null,
            activeSSE: null,
          });
          connection.close();
        },
      });

      set({ activeCorrelationId: correlationId, activeSSE: connection });
    } catch (err) {
      set({
        isStreaming: false,
        isThinking: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
        activeCorrelationId: null,
        activeSSE: null,
      });
    }
  },

  stopStream: () => {
    const { activeSSE, activeCorrelationId, streamingContent } = get();

    if (activeSSE) {
      activeSSE.close();
    }

    if (activeCorrelationId) {
      api.chat.cancel(activeCorrelationId).catch(() => {});
    }

    if (streamingContent) {
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: `msg-cancelled-${Date.now()}`,
            conversationId: state.activeConversationId ?? '',
            role: ChatRole.ASSISTANT,
            content: streamingContent,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    }

    set({
      _rawStream: '',
      streamingContent: '',
      streamingThinking: null,
      streamingSources: [],
      isStreaming: false,
      isThinking: false,
      activeCorrelationId: null,
      activeSSE: null,
    });
  },

  appendStreamChunk: (chunk) => {
    set((state) => {
      const raw = state._rawStream + chunk;
      const { thinking, content } = extractThinkingAndContent(raw, true);

      return {
        _rawStream: raw,
        streamingContent: content,
        streamingThinking: thinking,
        isThinking: !content && !!thinking,
      };
    });
  },

  finalizeStream: (sources, confidenceScore) => {
    set((state) => {
      const content = cleanAssistantContent(state._rawStream);
      const resolvedSources = normalizeSources(sources) ?? [];
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        conversationId: state.activeConversationId ?? '',
        role: ChatRole.ASSISTANT,
        content,
        sources: resolvedSources,
        confidenceScore: confidenceScore ?? undefined,
        parts: buildMessageParts(content, resolvedSources),
        createdAt: new Date().toISOString(),
      };

      return {
        messages: [...state.messages, assistantMessage],
        _rawStream: '',
        streamingContent: '',
        streamingThinking: null,
        streamingSources: [],
        isStreaming: false,
        isThinking: false,
        activeCorrelationId: null,
        activeSSE: null,
      };
    });
  },

  loadHistory: async () => {
    try {
      const result = await api.chat.history(TENANT_ID);
      set({ conversations: result.data.map(normalizeConversation) });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load history',
      });
    }
  },

  setActiveConversation: (id) => {
    const { activeSSE, activeCorrelationId } = get();
    if (activeSSE) {
      activeSSE.close();
      if (activeCorrelationId) {
        api.chat.cancel(activeCorrelationId).catch(() => {});
      }
    }

    const conversation = get().conversations.find((c) => c.id === id);
    set({
      activeConversationId: id,
      messages: conversation?.messages.map(normalizeMessage) ?? [],
      _rawStream: '',
      streamingContent: '',
      streamingThinking: null,
      isStreaming: false,
      isThinking: false,
      activeCorrelationId: null,
      activeSSE: null,
    });
  },

  clearError: () => set({ error: null }),
}));
