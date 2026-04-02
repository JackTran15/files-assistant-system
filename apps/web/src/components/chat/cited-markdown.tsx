import React, {
  Fragment,
  isValidElement,
  cloneElement,
  useMemo,
  type ReactNode,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ChatResponseSource,
  ChatResponseClaim,
  ChatResponseEvidence,
} from '@/types/chat.types';
import { CitationChip } from './citation-chip';
import { cn } from '@/lib/cn';

interface CitedMarkdownProps {
  content: string;
  sources?: ChatResponseSource[];
  claims?: ChatResponseClaim[];
  evidence?: ChatResponseEvidence[];
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

function applyStructuredClaims(
  content: string,
  claims: ChatResponseClaim[] | undefined,
  evidence: ChatResponseEvidence[] | undefined,
): string {
  if (!claims?.length || !evidence?.length) return content;

  const refByEvidence = new Map<string, number>(
    evidence.map((e, i) => [e.evidenceId, i + 1]),
  );

  let cursor = 0;
  let out = '';
  for (const claim of claims) {
    const idx = content.indexOf(claim.claimText, cursor);
    if (idx === -1) continue;
    const claimEnd = idx + claim.claimText.length;
    out += content.slice(cursor, claimEnd);

    const tail = content.slice(claimEnd);
    const hasMarkerAlready = /^\s*\[\d+\]/.test(tail);
    if (!hasMarkerAlready) {
      const markers = claim.evidenceIds
        .map((id) => refByEvidence.get(id))
        .filter((n): n is number => Boolean(n))
        .map((n) => `[${n}]`)
        .join('');
      if (markers) out += markers;
    }
    cursor = claimEnd;
  }

  out += content.slice(cursor);
  return out;
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

  comps.pre = ({ children, node: _node, className, ...rest }) => (
    <pre
      {...rest}
      className={cn(
        'overflow-x-auto rounded-md border border-slate-300 bg-slate-950 p-3 text-slate-50 dark:border-slate-700 dark:bg-slate-900',
        className as string | undefined,
      )}
    >
      {children as ReactNode}
    </pre>
  );

  comps.code = ({ children, node: _node, className, ...rest }) => {
    const isBlockCode = String(className ?? '').includes('language-');

    return (
      <code
        {...rest}
        className={cn(
          isBlockCode
            ? 'bg-transparent px-0 py-0 text-inherit'
            : 'rounded bg-slate-200 px-1 py-0.5 text-[0.9em] text-slate-900 dark:bg-slate-800 dark:text-slate-100',
          className as string | undefined,
        )}
      >
        {children as ReactNode}
      </code>
    );
  };

  comps.blockquote = ({ children, node: _node, className, ...rest }) => {
    const processed = processNode(
      children as ReactNode,
      sources,
      highlightedRef,
      onCitationClick,
    );

    return (
      <blockquote
        {...rest}
        className={cn(
          'rounded-r-md border-l-4 border-primary bg-slate-100 px-4 py-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
          className as string | undefined,
        )}
      >
        {processed}
      </blockquote>
    );
  };

  comps.table = ({ children, node: _node, className, ...rest }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-slate-300 dark:border-slate-700">
      <table
        {...rest}
        className={cn(
          'w-full border-collapse bg-slate-50 dark:bg-slate-950',
          className as string | undefined,
        )}
      >
        {children as ReactNode}
      </table>
    </div>
  );

  comps.th = ({ children, node: _node, className, ...rest }) => {
    const processed = processNode(
      children as ReactNode,
      sources,
      highlightedRef,
      onCitationClick,
    );

    return (
      <th
        {...rest}
        className={cn(
          'border border-slate-300 bg-slate-200 px-3 py-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800',
          className as string | undefined,
        )}
      >
        {processed}
      </th>
    );
  };

  comps.td = ({ children, node: _node, className, ...rest }) => {
    const processed = processNode(
      children as ReactNode,
      sources,
      highlightedRef,
      onCitationClick,
    );

    return (
      <td
        {...rest}
        className={cn(
          'border border-slate-300 bg-white px-3 py-2 align-top dark:border-slate-700 dark:bg-slate-900',
          className as string | undefined,
        )}
      >
        {processed}
      </td>
    );
  };

  return comps;
}

export function CitedMarkdown({
  content,
  sources,
  claims,
  evidence,
  highlightedRef,
  onCitationClick,
}: CitedMarkdownProps) {
  const renderedContent = useMemo(
    () => applyStructuredClaims(content, claims, evidence),
    [content, claims, evidence],
  );

  const hasCitations = useMemo(
    () => Boolean(sources?.length) && HAS_CITATION_RE.test(renderedContent),
    [renderedContent, sources],
  );

  if (!hasCitations) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedContent}</ReactMarkdown>
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
      {renderedContent}
    </ReactMarkdown>
  );
}
