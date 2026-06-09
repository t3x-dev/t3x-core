'use client';

import { GitCompareArrows, GitMerge, Leaf, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

export interface CommitAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'leaf' | 'merge';
}

interface CommitActionPanelProps {
  x: number;
  y: number;
  actions: CommitAction[];
  onClose: () => void;
}

export function CommitActionPanel({ x, y, actions, onClose }: CommitActionPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Delay attaching click listener to avoid immediate close from triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position if overflowing viewport
  useEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      panelRef.current.style.left = `${window.innerWidth - rect.width - 12}px`;
      panelRef.current.style.transform = 'none';
    }
    if (rect.left < 0) {
      panelRef.current.style.left = '12px';
      panelRef.current.style.transform = 'none';
    }
    if (rect.bottom > window.innerHeight) {
      panelRef.current.style.top = `${y - rect.height - 10}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--stroke-default)] px-1.5 py-1',
        'bg-[var(--surface-elevated)]/95 shadow-[var(--fx-shadow-hover)] backdrop-blur-sm',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          data-intro-target={introTargetForAction(action)}
          title={action.label}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            'border border-transparent transition-colors',
            action.tone === 'primary'
              ? 'bg-[var(--accent-commit)] text-[var(--on-accent)] hover:bg-[var(--accent-commit)]/90'
              : action.tone === 'leaf'
                ? 'bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)] hover:border-[var(--accent-leaf)]/25 hover:bg-[var(--accent-leaf)]/15'
                : action.tone === 'merge'
                  ? 'bg-[var(--accent-branch-soft)] text-[var(--accent-branch)] hover:border-[var(--accent-branch)]/25 hover:bg-[var(--accent-branch)]/15'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          <span className="shrink-0 opacity-70">{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function introTargetForAction(action: CommitAction): string | undefined {
  if (action.label === 'Open Leaf') return 'canvas-floating-action-open-leaf';
  if (action.label === 'New Leaf') return 'canvas-floating-action-new-leaf';
  if (action.label === 'Merge') return 'canvas-floating-action-merge';
  return undefined;
}

/** Build standard actions for a committed node */
export function buildCommitActions(opts: {
  onViewDiff?: () => void;
  onOpenLeaf?: () => void;
  onCreateLeaf: () => void;
  /** Optional: surfaces a "Merge" action when the commit is the latest tip of a non-main branch. */
  onMerge?: () => void;
}): CommitAction[] {
  const actions: CommitAction[] = [];

  if (opts.onViewDiff) {
    actions.push({
      label: 'View Diff',
      icon: <GitCompareArrows size={14} />,
      onClick: opts.onViewDiff,
    });
  }

  if (opts.onOpenLeaf) {
    actions.push({
      label: 'Open Leaf',
      icon: <Leaf size={14} />,
      onClick: opts.onOpenLeaf,
      tone: 'leaf',
    });
  }

  actions.push({
    label: 'New Leaf',
    icon: <Plus size={14} />,
    onClick: opts.onCreateLeaf,
    tone: 'leaf',
  });

  if (opts.onMerge) {
    actions.push({
      label: 'Merge',
      icon: <GitMerge size={14} />,
      onClick: opts.onMerge,
      tone: 'merge',
    });
  }
  return actions;
}
