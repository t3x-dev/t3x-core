'use client';

/**
 * MergeDiffSection - Collapsible section for diff groups
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

type SectionVariant = 'success' | 'warning' | 'info' | 'default';

interface MergeDiffSectionProps {
  title: string;
  subtitle?: string;
  variant?: SectionVariant;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  /** Navigation anchor ID for sidebar scroll tracking */
  navId?: string;
}

const variantStyles: Record<SectionVariant, { header: string; icon: string }> = {
  success: {
    header: 'text-[var(--diff-added-text)]',
    icon: 'text-[var(--diff-added-accent)]',
  },
  warning: {
    header: 'text-[var(--diff-modified-text)]',
    icon: 'text-[var(--diff-modified-accent)]',
  },
  info: {
    header: 'text-[var(--status-info)]',
    icon: 'text-[var(--status-info)]',
  },
  default: {
    header: 'text-foreground',
    icon: 'text-muted-foreground',
  },
};

export function MergeDiffSection({
  title,
  subtitle,
  variant = 'default',
  defaultCollapsed = false,
  children,
  navId,
}: MergeDiffSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const styles = variantStyles[variant];

  return (
    <div className="border rounded-lg overflow-hidden elevation-1" data-merge-nav={navId}>
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {collapsed ? (
          <ChevronRight className={`h-4 w-4 ${styles.icon}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${styles.icon}`} />
        )}
        <span className={`font-semibold ${styles.header}`}>{title}</span>
        {subtitle && <span className="text-sm text-muted-foreground ml-2">{subtitle}</span>}
      </button>

      {/* Section Content */}
      {!collapsed && <div className="p-[var(--space-group)] bg-background">{children}</div>}
    </div>
  );
}
