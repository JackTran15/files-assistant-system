import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/stores/chat-store';
import { useFilesStore } from '@/stores/files-store';
import { cn } from '@/lib/cn';

export function ChatInput() {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming, sendMessage, stopStream } = useChatStore();
  const selectedFileIds = useFilesStore((s) => s.selectedFileIds);
  const files = useFilesStore((s) => s.files);

  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
  const hasText = value.trim().length > 0;

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const handleSend = () => {
    if (!hasText) return;
    const fileIds =
      selectedFileIds.size > 0 ? Array.from(selectedFileIds) : undefined;
    sendMessage(value.trim(), fileIds);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-card px-4 py-3">
      {selectedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground mr-1 self-center">
            Context:
          </span>
          {selectedFiles.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      {isStreaming && (
        <div className="mb-2 flex justify-center">
          <button
            onClick={stopStream}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop generating
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your files..."
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            'max-h-[200px]',
          )}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!hasText}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
