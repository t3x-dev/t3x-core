'use client';

import { GripVertical } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { cn } from '@/utils/cn';

interface StatePaneResizeHandleProps {
  className?: string;
  label: string;
  max: number;
  min: number;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onReset: () => void;
  value: number;
}

export function StatePaneResizeHandle({
  className,
  label,
  max,
  min,
  onKeyDown,
  onMouseDown,
  onReset,
  value,
}: StatePaneResizeHandleProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the separator is also an interactive keyboard and pointer control.
    <button
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(value)}
      className={cn(
        'group relative z-10 w-2 shrink-0 cursor-col-resize border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/60',
        className
      )}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      role="separator"
      title="Drag to resize. Use arrow keys for precise adjustment. Double-click to reset."
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--stroke-divider)] transition-colors group-hover:bg-[var(--accent-commit)]/60 group-active:bg-[var(--accent-commit)] group-focus-visible:bg-[var(--accent-commit)]/60"
      />
      <span className="absolute left-1/2 top-1/2 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100">
        <GripVertical aria-hidden="true" className="size-3 text-[var(--text-tertiary)]" />
      </span>
    </button>
  );
}
