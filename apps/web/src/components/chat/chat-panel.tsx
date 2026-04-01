import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/stores/chat-store';
import { AlertCircle, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ChatPanel({ sidebarOpen, onToggleSidebar }: ChatPanelProps) {
  const { error, clearError } = useChatStore();

  return (
    <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleSidebar}
          aria-label={
            sidebarOpen ? 'Close file explorer' : 'Open file explorer'
          }
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>
        <h1 className="text-sm font-semibold">Chat</h1>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <MessageList />
      <ChatInput />
    </main>
  );
}
