import { useChatStore } from '@/stores/chat-store';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { MessageBubble } from './message-bubble';
import { StreamingMessage } from './streaming-message';
import { ThinkingIndicator } from './thinking-indicator';
import { MessageSquare } from 'lucide-react';

export function MessageList() {
  const { messages, streamingContent, isThinking, isStreaming } =
    useChatStore();

  const scrollRef = useAutoScroll([
    messages.length,
    streamingContent,
    isThinking,
  ]);

  const isEmpty = messages.length === 0 && !isThinking && !isStreaming;

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
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isThinking && <ThinkingIndicator />}
          {streamingContent && <StreamingMessage content={streamingContent} />}
        </div>
      )}
    </div>
  );
}
