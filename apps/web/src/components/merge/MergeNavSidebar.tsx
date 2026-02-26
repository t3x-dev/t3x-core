'use client';

/**
 * MergeNavSidebar — Left sidebar for navigating merge items with progress tracking.
 *
 * Shows grouped navigation items with status indicators and a progress bar.
 * Collapsible to a narrow strip. Hidden below md breakpoint.
 */

import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MergeNavItem, NavItemStatus } from './buildMergeNavItems';

interface MergeNavSidebarProps {
  items: MergeNavItem[];
  activeItemId: string | null;
  onItemClick: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  resolvedCount: number;
  totalConflicts: number;
}

const statusConfig: Record<NavItemStatus, { icon: typeof CheckCircle; className: string }> = {
  'auto-kept': { icon: CheckCircle, className: 'text-[var(--diff-added-accent)]' },
  resolved: { icon: CheckCircle, className: 'text-[var(--diff-added-accent)]' },
  unresolved: { icon: AlertTriangle, className: 'text-[var(--diff-modified-accent)]' },
  kept: { icon: Plus, className: 'text-[var(--accent-commit)]' },
  discarded: { icon: Minus, className: 'text-[var(--text-tertiary)]' },
};

const typeLabels: Record<MergeNavItem['type'], string> = {
  identical: 'Identical',
  conflict: 'Conflicts',
  'source-only': 'Source Only',
  'target-only': 'Target Only',
};

export function MergeNavSidebar({
  items,
  activeItemId,
  onItemClick,
  collapsed,
  onToggleCollapse,
  resolvedCount,
  totalConflicts,
}: MergeNavSidebarProps) {
  const progress = totalConflicts > 0 ? (resolvedCount / totalConflicts) * 100 : 100;

  // Group items by type for section headers
  const groups: { type: MergeNavItem['type']; items: MergeNavItem[] }[] = [];
  let currentType: MergeNavItem['type'] | null = null;

  for (const item of items) {
    if (item.type !== currentType) {
      currentType = item.type;
      groups.push({ type: item.type, items: [item] });
    } else {
      groups[groups.length - 1].items.push(item);
    }
  }

  // Collapsed state — narrow strip with toggle + counter
  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] py-2 gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-tertiary)]"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {totalConflicts > 0 && (
          <span
            className={cn(
              'text-xs font-medium',
              resolvedCount === totalConflicts
                ? 'text-[var(--diff-added-accent)]'
                : 'text-[var(--diff-modified-accent)]'
            )}
            title={`${resolvedCount}/${totalConflicts} resolved`}
          >
            {resolvedCount}/{totalConflicts}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-52 border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--stroke-divider)]">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[var(--text-primary)]">
            {totalConflicts > 0 ? `${resolvedCount}/${totalConflicts} resolved` : 'No conflicts'}
          </div>
          {/* Progress bar */}
          <div className="mt-1 h-1 rounded-full bg-[var(--stroke-divider)] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress === 100
                  ? 'bg-[var(--diff-added-accent)]'
                  : 'bg-[var(--diff-modified-accent)]'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-2 p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-tertiary)]"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable item list */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map((group) => (
          <div key={group.type}>
            {/* Section header */}
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {typeLabels[group.type]}
            </div>
            {/* Items */}
            {group.items.map((item) => {
              const config = statusConfig[item.status];
              const Icon = config.icon;
              const isActive = item.id === activeItemId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item.id)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-xs transition-colors',
                    isActive
                      ? 'bg-[var(--hover-bg-strong)] border-l-2 border-l-[var(--accent-commit)]'
                      : 'border-l-2 border-l-transparent hover:bg-[var(--hover-bg)]'
                  )}
                  title={item.label}
                >
                  <Icon className={cn('h-3 w-3 shrink-0', config.className)} />
                  <span className="truncate text-[var(--text-secondary)]">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
