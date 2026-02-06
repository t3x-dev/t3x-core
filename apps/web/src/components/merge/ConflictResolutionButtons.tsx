'use client';

/**
 * ConflictResolutionButtons - Three resolution action buttons
 *
 * Keyboard shortcuts:
 * - A = Keep A (Source)
 * - B = Keep B (Target)
 * - X = Keep Both
 *
 * - Keep A: Select source sentence
 * - Keep B: Select target sentence
 * - Keep Both: Include both sentences in merge
 */

import { ArrowLeft, ArrowRight, Layers } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

type Resolution = 'source' | 'target' | 'both';

interface ConflictResolutionButtonsProps {
  current: Resolution | null;
  onResolve: (resolution: Resolution) => void;
  sourceBranch?: string;
  targetBranch?: string;
  /** Enable keyboard shortcuts (A/B/X) - default: true */
  enableKeyboard?: boolean;
}

interface ButtonConfig {
  resolution: Resolution;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
  shortcut: string;
}

export function ConflictResolutionButtons({
  current,
  onResolve,
  sourceBranch = 'A',
  targetBranch = 'B',
  enableKeyboard = true,
}: ConflictResolutionButtonsProps) {
  // Keyboard shortcuts: A/B/X
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ignore if modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          onResolve('source');
          break;
        case 'b':
          onResolve('target');
          break;
        case 'x':
          onResolve('both');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboard, onResolve]);

  const buttons: ButtonConfig[] = [
    {
      resolution: 'source',
      icon: <ArrowLeft className="h-4 w-4" />,
      label: `Keep ${sourceBranch}`,
      activeClass:
        'border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] ring-1 ring-[var(--diff-removed-line)]/40 bg-transparent',
      shortcut: 'A',
    },
    {
      resolution: 'target',
      icon: <ArrowRight className="h-4 w-4" />,
      label: `Keep ${targetBranch}`,
      activeClass:
        'border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] ring-1 ring-[var(--diff-added-line)]/40 bg-transparent',
      shortcut: 'B',
    },
    {
      resolution: 'both',
      icon: <Layers className="h-4 w-4" />,
      label: 'Keep Both',
      activeClass:
        'border-[var(--accent-commit)]/40 text-[var(--accent-commit)] ring-1 ring-[var(--accent-commit)]/40 bg-transparent',
      shortcut: 'X',
    },
  ];

  return (
    <div className="flex items-center gap-2 mt-4">
      {buttons.map((btn) => {
        const isActive = current === btn.resolution;
        return (
          <button
            key={btn.resolution}
            type="button"
            onClick={() => onResolve(btn.resolution)}
            title={enableKeyboard ? `${btn.label} (${btn.shortcut})` : btn.label}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
              isActive
                ? btn.activeClass
                : 'border-[var(--stroke-divider)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:border-[var(--stroke-default)]'
            )}
          >
            {btn.icon}
            <span>{btn.label}</span>
            {enableKeyboard && (
              <kbd className="ml-1 text-[0.65rem] font-mono bg-[var(--hover-bg)] px-1 rounded opacity-80">
                {btn.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
