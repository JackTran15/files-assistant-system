import type { ChatResponseSource } from '@/types/chat.types';
import { Tooltip } from '@/components/ui/tooltip';
import { MarkdownPreviewTooltip } from '@/components/ui/markdown-preview-tooltip';
import { cn } from '@/lib/cn';

interface CitationChipProps {
  refIndex: number;
  source?: ChatResponseSource;
  isHighlighted?: boolean;
  onClick?: (refIndex: number) => void;
}

function SourceTooltipContent({ refIndex, source }: { refIndex: number; source: ChatResponseSource }) {
  return (
    <div className="space-y-1 text-left">
      <p className="font-medium">
        [{refIndex}] {source.fileName}
        {source.pageNumber != null && (
          <span className="opacity-70"> (p. {source.pageNumber})</span>
        )}
      </p>
      {source.excerpt && (
        <p className="italic opacity-80 leading-snug whitespace-pre-wrap break-words">
          &ldquo;{source.excerpt}&rdquo;
        </p>
      )}
      <p className="opacity-60 text-[10px]">
        Relevance: {Math.round(source.score * 100)}%
      </p>
    </div>
  );
}

export function CitationChip({ refIndex, source, isHighlighted, onClick }: CitationChipProps) {
  const chip = (
    <button
      type="button"
      onClick={() => onClick?.(refIndex)}
      className={cn(
        'inline-flex items-center justify-center',
        'mx-0.5 min-w-[1.25rem] rounded px-1 py-0.5',
        'text-[10px] font-semibold leading-none',
        'transition-colors cursor-pointer',
        'align-super',
        isHighlighted
          ? 'bg-primary text-primary-foreground'
          : 'bg-primary/15 text-primary hover:bg-primary/25',
      )}
    >
      {refIndex}
    </button>
  );

  if (!source) return chip;

  if (source.content) {
    return (
      <MarkdownPreviewTooltip
        markdown={source.content}
        searchText={source.excerpt}
      >
        {chip}
      </MarkdownPreviewTooltip>
    );
  }

  return (
    <Tooltip
      content={<SourceTooltipContent refIndex={refIndex} source={source} />}
      maxWidth="280px"
    >
      {chip}
    </Tooltip>
  );
}
