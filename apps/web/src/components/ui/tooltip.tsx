import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

const VIEWPORT_PADDING = 8;

function Tooltip({ content, children, className, maxWidth }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [posStyle, setPosStyle] = useState<CSSProperties>({});

  const show = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setVisible(false), 100);
  }, []);

  useEffect(() => {
    return () => clearTimeout(hideTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const top = rect.top - 6;
      let left = rect.left + rect.width / 2;

      const parsedMaxWidth = maxWidth ? parseInt(maxWidth, 10) : 200;
      const halfW = parsedMaxWidth / 2;
      if (left - halfW < VIEWPORT_PADDING) left = halfW + VIEWPORT_PADDING;
      if (left + halfW > window.innerWidth - VIEWPORT_PADDING)
        left = window.innerWidth - VIEWPORT_PADDING - halfW;

      setPosStyle({
        position: 'fixed',
        bottom: window.innerHeight - top,
        left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
      });
    }
  }, [visible, maxWidth]);

  const panel = visible
    ? createPortal(
        <div
          className={cn(
            'pointer-events-none',
            'rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background',
            'animate-in fade-in-0 duration-100',
            maxWidth ? 'whitespace-normal' : 'whitespace-nowrap',
          )}
          style={{ ...posStyle, maxWidth: maxWidth ?? undefined }}
        >
          {content}
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

export { Tooltip };
