'use client';

import { cn } from '@/lib/utils';

export type DiffMode = 'frame' | 'sentence';

interface DiffModeToggleProps {
  mode: DiffMode;
  onChange: (mode: DiffMode) => void;
  hidden?: boolean;
  className?: string;
}

export function DiffModeToggle({ mode, onChange, hidden, className }: DiffModeToggleProps) {
  if (hidden) return null;

  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-[var(--stroke-divider)] overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange('frame')}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
          mode === 'frame'
            ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        )}
      >
        Frame
        {mode === 'frame' && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-commit)]" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange('sentence')}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-l border-[var(--stroke-divider)]',
          mode === 'sentence'
            ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        )}
      >
        Sentence
      </button>
    </div>
  );
}
