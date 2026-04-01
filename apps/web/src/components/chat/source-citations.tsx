import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { ChatResponseSource } from '@/types/chat.types';
import { cn } from '@/lib/cn';

interface SourceCitationsProps {
  sources: ChatResponseSource[];
  confidenceScore?: number | null;
}

export function SourceCitations({
  sources,
  confidenceScore,
}: SourceCitationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border bg-card text-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>
          {sources.length} source{sources.length > 1 ? 's' : ''}
        </span>
        {confidenceScore != null && (
          <span
            className={cn(
              'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              confidenceScore >= 0.7
                ? 'bg-emerald-100 text-emerald-800'
                : confidenceScore >= 0.4
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800',
            )}
          >
            {Math.round(confidenceScore * 100)}% confidence
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {sources.map((source, i) => (
            <div
              key={`${source.fileId}-${source.chunkIndex}`}
              className="flex items-start gap-2"
            >
              <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  [{i + 1}] {source.fileName}
                  {source.pageNumber != null && (
                    <span className="text-muted-foreground">
                      {' '}
                      (p. {source.pageNumber})
                    </span>
                  )}
                </p>
                {source.excerpt && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 italic">
                    "{source.excerpt}"
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Relevance: {Math.round(source.score * 100)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
