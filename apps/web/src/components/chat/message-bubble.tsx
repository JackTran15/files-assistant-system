import { useState, useCallback } from 'react';
import type { Message, ChatResponseSource } from '@/types/chat.types';
import { ChatRole } from '@/types/chat.types';
import { SourceCitations } from './source-citations';
import { CitedMarkdown } from './cited-markdown';
import { cn } from '@/lib/cn';
import { Bot, User } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  onSourceClick?: (source: ChatResponseSource) => void;
}

export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === ChatRole.USER;
  const [highlightedRef, setHighlightedRef] = useState<number | null>(null);

  const handleCitationClick = useCallback((refIndex: number) => {
    setHighlightedRef((prev) => (prev === refIndex ? null : refIndex));
  }, []);

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-background">
              <CitedMarkdown
                content={message.content}
                sources={message.sources}
                highlightedRef={highlightedRef}
                onCitationClick={handleCitationClick}
              />
            </div>
            {message.sources && message.sources.length > 0 && (
              <SourceCitations
                sources={message.sources}
                confidenceScore={message.confidenceScore}
                highlightedRef={highlightedRef}
                onSourceClick={onSourceClick}
              />
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
