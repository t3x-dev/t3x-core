'use client';

import { Check, ChevronDown, ChevronRight, Minus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

const variantIcon = {
  identical: Check,
  modified: Pencil,
  removed: Minus,
  added: Plus,
} as const;

interface DiffSectionHeaderProps {
  title: string;
  count: number;
  variant: 'identical' | 'modified' | 'removed' | 'added';
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

const variantStyles = {
  identical: {
    bg: 'bg-muted/30',
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
  modified: {
    bg: 'bg-[var(--diff-modified-bg)]',
    text: 'text-[var(--diff-modified-accent)]',
    badge: 'bg-[var(--diff-modified-bg)] text-[var(--diff-modified-accent)]',
  },
  removed: {
    bg: 'bg-[var(--diff-removed-bg)]',
    text: 'text-[var(--diff-removed-accent)]',
    badge: 'bg-[var(--diff-removed-bg)] text-[var(--diff-removed-accent)]',
  },
  added: {
    bg: 'bg-[var(--diff-added-bg)]',
    text: 'text-[var(--diff-added-accent)]',
    badge: 'bg-[var(--diff-added-bg)] text-[var(--diff-added-accent)]',
  },
};

export function DiffSectionHeader({
  title,
  count,
  variant,
  defaultCollapsed = false,
  children,
}: DiffSectionHeaderProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const styles = variantStyles[variant];
  const Icon = variantIcon[variant];

  if (count === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-2 px-4 py-3 ${styles.bg} hover:brightness-95 transition-all`}
      >
        {collapsed ? (
          <ChevronRight className={`h-4 w-4 ${styles.text}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${styles.text}`} />
        )}
        <Icon className={`h-3.5 w-3.5 ${styles.text}`} />
        <span className={`text-sm font-semibold ${styles.text}`}>{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>{count}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}
