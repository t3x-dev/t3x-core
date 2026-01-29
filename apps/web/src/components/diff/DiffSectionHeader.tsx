'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface DiffSectionHeaderProps {
  title: string;
  count: number;
  variant: 'identical' | 'modified' | 'removed' | 'added';
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

const variantStyles = {
  identical: { bg: 'bg-muted/30', text: 'text-muted-foreground', badge: 'bg-gray-100 text-gray-600' },
  modified: { bg: 'bg-amber-50/50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  removed: { bg: 'bg-red-50/50', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  added: { bg: 'bg-green-50/50', text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
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

  if (count === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-2 px-4 py-2.5 ${styles.bg} hover:opacity-80 transition-opacity`}
      >
        {collapsed ? (
          <ChevronRight className={`h-4 w-4 ${styles.text}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${styles.text}`} />
        )}
        <span className={`text-sm font-medium ${styles.text}`}>{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>{count}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}
