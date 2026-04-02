import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  Fragment,
  isValidElement,
  cloneElement,
  createElement,
  type ReactNode,
  type FC,
  type MutableRefObject,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

interface MarkdownPreviewTooltipProps {
  markdown?: string;
  searchText?: string;
  children: ReactNode;
  className?: string;
  maxHeight?: number;
  maxWidth?: number;
  loading?: boolean;
  onOpen?: () => void;
  emptyStateText?: string;
}

const VIEWPORT_PADDING = 12;

let hlKey = 0;

function highlightTextInNode(
  node: ReactNode,
  search: string,
  firstMatchRef: MutableRefObject<HTMLElement | null>,
): ReactNode {
  if (typeof node === 'string') {
    if (!search) return node;

    const parts: ReactNode[] = [];
    const lower = node.toLowerCase();
    const searchLower = search.toLowerCase();
    let lastIndex = 0;
    let idx: number;

    while ((idx = lower.indexOf(searchLower, lastIndex)) !== -1) {
      if (idx > lastIndex) {
        parts.push(node.slice(lastIndex, idx));
      }
      const isFirst = !firstMatchRef.current;
      parts.push(
        <mark
          key={`hl-${hlKey++}`}
          ref={
            isFirst
              ? (el: HTMLElement | null) => {
                  if (el) firstMatchRef.current = el;
                }
              : undefined
          }
          className="bg-yellow-300 dark:bg-yellow-600/70 text-inherit rounded-sm px-0.5"
        >
          {node.slice(idx, idx + search.length)}
        </mark>,
      );
      lastIndex = idx + search.length;
    }

    if (lastIndex < node.length) {
      parts.push(node.slice(lastIndex));
    }

    return parts.length > 1 ? <>{parts}</> : parts[0] ?? node;
  }

  if (typeof node === 'number') return node;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={i}>
        {highlightTextInNode(child, search, firstMatchRef)}
      </Fragment>
    ));
  }

  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (props.children != null) {
      return cloneElement(
        node,
        {},
        highlightTextInNode(
          props.children as ReactNode,
          search,
          firstMatchRef,
        ),
      );
    }
  }

  return node;
}

const TEXT_TAGS = [
  'p',
  'li',
  'td',
  'th',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const;

function buildHighlightComponents(
  search: string,
  firstMatchRef: MutableRefObject<HTMLElement | null>,
) {
  const comps: Record<string, FC<Record<string, unknown>>> = {};

  for (const tag of TEXT_TAGS) {
    const Comp: FC<Record<string, unknown>> = ({
      children,
      node: _node,
      ...rest
    }) => {
      const processed = highlightTextInNode(
        children as ReactNode,
        search,
        firstMatchRef,
      );
      return createElement(tag, rest, processed);
    };
    Comp.displayName = `Hl_${tag}`;
    comps[tag] = Comp;
  }

  return comps;
}

function computePosition(
  triggerRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
): CSSProperties {
  const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING;

  let top: number;
  if (spaceBelow >= panelHeight) {
    top = triggerRect.bottom + 6;
  } else if (spaceAbove >= panelHeight) {
    top = triggerRect.top - panelHeight - 6;
  } else if (spaceBelow >= spaceAbove) {
    top = triggerRect.bottom + 6;
  } else {
    top = triggerRect.top - panelHeight - 6;
  }

  let left = triggerRect.left;
  if (left + panelWidth > window.innerWidth - VIEWPORT_PADDING) {
    left = window.innerWidth - VIEWPORT_PADDING - panelWidth;
  }
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  return { position: 'fixed', top, left, zIndex: 9999 };
}

export function MarkdownPreviewTooltip({
  markdown,
  searchText,
  children,
  className,
  maxHeight = 400,
  maxWidth = 480,
  loading = false,
  onOpen,
  emptyStateText = 'Preview unavailable.',
}: MarkdownPreviewTooltipProps) {
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstMatchRef = useRef<HTMLElement | null>(null);
  const [posStyle, setPosStyle] = useState<CSSProperties>({});

  const show = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    setVisible(true);
    onOpen?.();
  }, [onOpen]);

  const hide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setVisible(false), 200);
  }, []);

  useEffect(() => {
    return () => clearTimeout(hideTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosStyle(computePosition(rect, maxWidth, maxHeight));
    }
  }, [visible, maxWidth, maxHeight]);

  useEffect(() => {
    if (visible && firstMatchRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        firstMatchRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  }, [visible]);

  hlKey = 0;
  firstMatchRef.current = null;

  const components = useMemo(
    () =>
      searchText
        ? buildHighlightComponents(searchText, firstMatchRef)
        : undefined,
    [searchText],
  );

  const panel = visible
    ? createPortal(
        <div
          onMouseEnter={show}
          onMouseLeave={hide}
          className={cn(
            'rounded-lg border bg-popover text-popover-foreground shadow-xl',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{ ...posStyle, maxWidth, width: maxWidth }}
        >
          <div
            ref={scrollRef}
            className={cn(
              'overflow-auto p-4 text-sm leading-relaxed',
              '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1.5',
              '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5',
              '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
              '[&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1',
              '[&_p]:my-1.5',
              '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5',
              '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5',
              '[&_li]:my-0.5',
              '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
              '[&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre]:text-xs',
              '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs',
              '[&_hr]:my-3 [&_hr]:border-border',
              '[&_table]:w-full [&_table]:text-xs',
              '[&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:pb-1',
              '[&_td]:border-b [&_td]:py-1',
              '[&_strong]:font-semibold',
              '[&_a]:text-primary [&_a]:underline',
            )}
            style={{ maxHeight }}
          >
            {loading ? (
              <p className="text-muted-foreground">Loading preview...</p>
            ) : markdown ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components as never}
              >
                {markdown}
              </ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">{emptyStateText}</p>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <span
      ref={triggerRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {panel}
    </span>
  );
}
