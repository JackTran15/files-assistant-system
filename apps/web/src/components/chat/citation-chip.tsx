import type { ChatResponseSource } from '@/types/chat.types';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface CitationChipProps {
  refIndex: number;
  source?: ChatResponseSource;
  isHighlighted?: boolean;
  onClick?: (refIndex: number) => void;
}

const MAX_TOOLTIP_EXCERPT = 160;

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_TOOLTIP_EXCERPT) return text;
  return text.slice(0, MAX_TOOLTIP_EXCERPT) + '…';
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
        <p className="italic opacity-80 leading-snug">
          &ldquo;{truncateExcerpt(source.excerpt)}&rdquo;
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

  return (
    <Tooltip
      content={<SourceTooltipContent refIndex={refIndex} source={source} />}
      maxWidth="280px"
    >
      {chip}
    </Tooltip>
  );
}
