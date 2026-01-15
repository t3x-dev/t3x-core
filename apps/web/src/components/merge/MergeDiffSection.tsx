'use client';

/**
 * MergeDiffSection - Collapsible section for diff groups
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type SectionVariant = 'success' | 'warning' | 'info' | 'default';

interface MergeDiffSectionProps {
  title: string;
  subtitle?: string;
  variant?: SectionVariant;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<SectionVariant, { header: string; icon: string }> = {
  success: {
    header: 'text-green-700',
    icon: 'text-green-500',
  },
  warning: {
    header: 'text-yellow-700',
    icon: 'text-yellow-500',
  },
  info: {
    header: 'text-blue-700',
    icon: 'text-blue-500',
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
}: MergeDiffSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const styles = variantStyles[variant];

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {collapsed ? (
          <ChevronRight className={`h-4 w-4 ${styles.icon}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${styles.icon}`} />
        )}
        <span className={`font-semibold ${styles.header}`}>{title}</span>
        {subtitle && (
          <span className="text-sm text-muted-foreground ml-2">{subtitle}</span>
        )}
      </button>

      {/* Section Content */}
      {!collapsed && <div className="p-4 bg-background">{children}</div>}
    </div>
  );
}
