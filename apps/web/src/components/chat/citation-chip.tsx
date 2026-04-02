import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatResponseSource } from '@/types/chat.types';
import { MarkdownPreviewTooltip } from '@/components/ui/markdown-preview-tooltip';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';

interface CitationChipProps {
  refIndex: number;
  source?: ChatResponseSource;
  isHighlighted?: boolean;
  onClick?: (refIndex: number) => void;
}

function getCitationPreviewMarkdown(source: ChatResponseSource): string | undefined {
  return source.citationContent ?? source.content;
}

function getCitationPreviewSearchText(source: ChatResponseSource): string | undefined {
  if (!source.excerpt) return undefined;

  return source.excerpt.endsWith('…')
    ? source.excerpt.slice(0, -1)
    : source.excerpt;
}

export function CitationChip({ refIndex, source, isHighlighted, onClick }: CitationChipProps) {
  const initialMarkdown = useMemo(
    () => (source ? getCitationPreviewMarkdown(source) : undefined),
    [source],
  );
  const [previewMarkdown, setPreviewMarkdown] = useState(initialMarkdown);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [hasFetchedPreview, setHasFetchedPreview] = useState(false);

  useEffect(() => {
    setPreviewMarkdown(initialMarkdown);
    setIsLoadingPreview(false);
    setHasFetchedPreview(false);
  }, [initialMarkdown, source?.fileId, source?.chunkIndex]);

  const handlePreviewOpen = useCallback(() => {
    if (!source || hasFetchedPreview || isLoadingPreview) return;

    setIsLoadingPreview(true);
    api.files
      .getChunk(source.fileId, source.chunkIndex)
      .then((chunk) => {
        setPreviewMarkdown(chunk.content);
      })
      .catch(() => {
        // Keep the locally available text as fallback if the preview fetch fails.
      })
      .finally(() => {
        setHasFetchedPreview(true);
        setIsLoadingPreview(false);
      });
  }, [hasFetchedPreview, isLoadingPreview, source]);

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
          : 'bg-primary text-primary-foreground hover:brightness-95',
      )}
    >
      {refIndex}
    </button>
  );

  if (!source) return chip;
  return (
    <MarkdownPreviewTooltip
      markdown={previewMarkdown}
      searchText={getCitationPreviewSearchText(source)}
      loading={isLoadingPreview && !previewMarkdown}
      onOpen={handlePreviewOpen}
    >
      {chip}
    </MarkdownPreviewTooltip>
  );
}
