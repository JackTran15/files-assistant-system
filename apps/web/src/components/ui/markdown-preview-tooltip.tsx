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
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

interface MarkdownPreviewTooltipProps {
  markdown: string;
  searchText?: string;
  children: ReactNode;
  className?: string;
  maxHeight?: number;
  maxWidth?: number;
}

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

export function MarkdownPreviewTooltip({
  markdown,
  searchText,
  children,
  className,
  maxHeight = 400,
  maxWidth = 480,
}: MarkdownPreviewTooltipProps) {
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstMatchRef = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setVisible(false), 200);
  }, []);

  useEffect(() => {
    return () => clearTimeout(hideTimeoutRef.current);
  }, []);

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

  return (
    <div className={cn('relative inline-flex', className)}>
      <div onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </div>

      {visible && (
        <div
          onMouseEnter={show}
          onMouseLeave={hide}
          className={cn(
            'absolute top-full left-0 z-50 mt-2',
            'rounded-lg border bg-popover text-popover-foreground shadow-xl',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{ maxWidth, width: maxWidth }}
        >
          <div
            ref={scrollRef}
            className={cn(
              'overflow-auto p-4',
              'prose prose-sm max-w-none dark:prose-invert',
              'prose-p:leading-relaxed prose-pre:bg-background',
              'prose-headings:mt-3 prose-headings:mb-1.5',
              'prose-p:my-1.5 prose-li:my-0.5',
            )}
            style={{ maxHeight }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={components as never}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
