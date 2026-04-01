import { cn } from '@/lib/cn';

interface CitationChipProps {
  refIndex: number;
  isHighlighted?: boolean;
  onClick?: (refIndex: number) => void;
}

export function CitationChip({ refIndex, isHighlighted, onClick }: CitationChipProps) {
  return (
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
      title={`Source [${refIndex}]`}
    >
      {refIndex}
    </button>
  );
}
