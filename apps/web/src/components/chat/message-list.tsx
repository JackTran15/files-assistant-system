import { useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useFilesStore } from '@/stores/files-store';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { MessageBubble } from './message-bubble';
import { StreamingMessage } from './streaming-message';
import { ThinkingIndicator } from './thinking-indicator';
import { MessageSquare } from 'lucide-react';
import type { ChatResponseSource } from '@/types/chat.types';

export function MessageList() {
  const {
    messages,
    streamingContent,
    streamingThinking,
    streamingSources,
    isThinking,
    isStreaming,
  } = useChatStore();
  const highlightFile = useFilesStore((s) => s.highlightFile);

  const scrollRef = useAutoScroll([
    messages.length,
    streamingContent,
    streamingThinking,
    isThinking,
  ]);

  const handleSourceClick = useCallback(
    (source: ChatResponseSource) => {
      highlightFile(source.fileId);
    },
    [highlightFile],
  );

  const isEmpty = messages.length === 0 && !isThinking && !isStreaming;
  const showThinking = isThinking || (isStreaming && !!streamingThinking);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <MessageSquare className="h-12 w-12 opacity-30" />
          <h3 className="text-lg font-medium">No messages yet</h3>
          <p className="text-sm max-w-sm text-center">
            Upload files and select them as context, then start asking questions
            about your documents.
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSourceClick={handleSourceClick}
            />
          ))}
          {showThinking && <ThinkingIndicator text={streamingThinking} />}
          {streamingContent && (
            <StreamingMessage
              content={streamingContent}
              sources={streamingSources.length ? streamingSources : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
