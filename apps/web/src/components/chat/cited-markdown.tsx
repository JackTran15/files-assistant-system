import React, { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatResponseSource } from '@/types/chat.types';
import { CitationChip } from './citation-chip';

interface CitedMarkdownProps {
  content: string;
  sources?: ChatResponseSource[];
  highlightedRef?: number | null;
  onCitationClick?: (refIndex: number) => void;
}

const CITATION_RE = /\[(\d+)\]/g;

function injectCitations(
  text: string,
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(CITATION_RE)) {
    const refIndex = parseInt(match[1], 10);
    if (refIndex < 1 || refIndex > sources.length) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <CitationChip
        key={`cite-${key++}`}
        refIndex={refIndex}
        isHighlighted={highlightedRef === refIndex}
        onClick={onCitationClick}
      />,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function processChildren(
  children: ReactNode,
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
): ReactNode {
  if (typeof children === 'string') {
    const injected = injectCitations(
      children,
      sources,
      highlightedRef,
      onCitationClick,
    );
    return injected.length === 1 ? injected[0] : injected;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string' ? (
        <span key={i}>
          {injectCitations(child, sources, highlightedRef, onCitationClick)}
        </span>
      ) : (
        child
      ),
    );
  }

  return children;
}

function createTextReplacer(
  tag: string,
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
) {
  const Component = ({
    children,
    node: _node,
    ...props
  }: { children?: ReactNode; node?: unknown } & Record<string, unknown>) => {
    const processed = processChildren(
      children,
      sources,
      highlightedRef,
      onCitationClick,
    );
    return React.createElement(tag, props, processed);
  };
  Component.displayName = `Cited${tag}`;
  return Component;
}

export function CitedMarkdown({
  content,
  sources,
  highlightedRef,
  onCitationClick,
}: CitedMarkdownProps) {
  const hasCitations = useMemo(
    () => sources?.length && CITATION_RE.test(content),
    [content, sources],
  );

  if (!hasCitations) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    );
  }

  const components = useMemo(
    () => ({
      p: createTextReplacer('p', sources!, highlightedRef, onCitationClick),
      li: createTextReplacer('li', sources!, highlightedRef, onCitationClick),
      td: createTextReplacer('td', sources!, highlightedRef, onCitationClick),
      th: createTextReplacer('th', sources!, highlightedRef, onCitationClick),
      blockquote: createTextReplacer(
        'blockquote',
        sources!,
        highlightedRef,
        onCitationClick,
      ),
    }),
    [sources, highlightedRef, onCitationClick],
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components as never}
    >
      {content}
    </ReactMarkdown>
  );
}
