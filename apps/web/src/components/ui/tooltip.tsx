import * as React from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className={cn('group relative inline-flex', className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
        {content}
      </div>
    </div>
  );
}

export { Tooltip };
