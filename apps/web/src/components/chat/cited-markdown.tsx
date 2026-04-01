import React, {
  Fragment,
  isValidElement,
  cloneElement,
  useMemo,
  type ReactNode,
} from 'react';
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
const HAS_CITATION_RE = /\[(\d+)\]/;

let chipKey = 0;

function injectCitations(
  text: string,
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CITATION_RE)) {
    const refIndex = parseInt(match[1], 10);
    if (refIndex < 1 || refIndex > sources.length) continue;

    const source = sources[refIndex - 1];
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <CitationChip
        key={`cite-${chipKey++}`}
        refIndex={refIndex}
        source={source}
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

function processNode(
  node: ReactNode,
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
): ReactNode {
  if (typeof node === 'string') {
    const injected = injectCitations(node, sources, highlightedRef, onCitationClick);
    return injected.length === 1 ? injected[0] : <>{injected}</>;
  }

  if (typeof node === 'number') return node;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={i}>
        {processNode(child, sources, highlightedRef, onCitationClick)}
      </Fragment>
    ));
  }

  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (props.children != null) {
      return cloneElement(
        node,
        {},
        processNode(
          props.children as ReactNode,
          sources,
          highlightedRef,
          onCitationClick,
        ),
      );
    }
  }

  return node;
}

const CONTAINER_TAGS = ['p', 'li', 'td', 'th', 'blockquote'] as const;

function buildComponents(
  sources: ChatResponseSource[],
  highlightedRef: number | null | undefined,
  onCitationClick: ((refIndex: number) => void) | undefined,
) {
  const comps: Record<string, React.FC<Record<string, unknown>>> = {};

  for (const tag of CONTAINER_TAGS) {
    const Comp: React.FC<Record<string, unknown>> = ({
      children,
      node: _node,
      ...rest
    }) => {
      const processed = processNode(
        children as ReactNode,
        sources,
        highlightedRef,
        onCitationClick,
      );
      return React.createElement(tag, rest, processed);
    };
    Comp.displayName = `Cited_${tag}`;
    comps[tag] = Comp;
  }

  return comps;
}

export function CitedMarkdown({
  content,
  sources,
  highlightedRef,
  onCitationClick,
}: CitedMarkdownProps) {
  const hasCitations = useMemo(
    () => Boolean(sources?.length) && HAS_CITATION_RE.test(content),
    [content, sources],
  );

  if (!hasCitations) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    );
  }

  chipKey = 0;

  const components = useMemo(
    () => buildComponents(sources!, highlightedRef, onCitationClick),
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
