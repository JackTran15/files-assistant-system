import * as React from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

function Tooltip({ content, children, className, maxWidth }: TooltipProps) {
  return (
    <div className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <div
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2',
          'rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background',
          'opacity-0 transition-opacity group-hover/tooltip:opacity-100',
          maxWidth ? 'whitespace-normal' : 'whitespace-nowrap',
        )}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {content}
      </div>
    </div>
  );
}

export { Tooltip };
