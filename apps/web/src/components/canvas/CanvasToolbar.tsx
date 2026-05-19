'use client';

import { Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

interface CanvasToolbarProps {
  projectName: string;
  onFitView: () => void;
}

export function CanvasToolbar({ projectName, onFitView }: CanvasToolbarProps) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-5',
        glass.panelBase,
        glass.highlight
      )}
    >
      <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">
        {projectName}
      </h2>
      <Button
        variant="ghost"
        size="icon"
        onClick={onFitView}
        title="Fit View"
        className={cn(
          'h-9 w-9 rounded-xl transition-all',
          'text-[var(--text-secondary)] hover:text-foreground',
          'hover:bg-primary/10 hover:text-primary'
        )}
      >
        <Maximize className="h-4 w-4" />
      </Button>
    </header>
  );
}
