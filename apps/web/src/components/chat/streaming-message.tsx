import { CitedMarkdown } from './cited-markdown';
import type { ChatResponseSource } from '@/types/chat.types';

interface StreamingMessageProps {
  content: string;
  sources?: ChatResponseSource[];
}

export function StreamingMessage({ content, sources }: StreamingMessageProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3">
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-background">
          <CitedMarkdown content={content} sources={sources} />
        </div>
        <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-blink align-text-bottom" />
      </div>
    </div>
  );
}
