import { useState } from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { FileExplorerPanel } from '@/components/file-explorer/file-explorer-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'z-30 transition-all duration-200 ease-in-out',
          'fixed md:relative h-full',
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:overflow-hidden',
        )}
      >
        <FileExplorerPanel />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Toggle button */}
        <div className="absolute top-2.5 left-2 z-10 md:relative md:top-0 md:left-0">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open file explorer"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
        </div>
        <ChatPanel
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>
    </div>
  );
}

export default App;
