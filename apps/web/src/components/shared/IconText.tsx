'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * IconText — atomic icon + text pairing with enforced size rules.
 *
 * Spec: frontend-art-template §1.8 / §5.9
 */

const sizeMap = {
  xs: { icon: 'h-3 w-3', text: 'text-xs', gap: 'gap-1' },
  sm: { icon: 'h-3.5 w-3.5', text: 'text-sm', gap: 'gap-1.5' },
  default: { icon: 'h-4 w-4', text: 'text-sm', gap: 'gap-2' },
};

interface IconTextProps {
  icon: LucideIcon;
  size?: keyof typeof sizeMap;
  className?: string;
  children: React.ReactNode;
}

export function IconText({ icon: Icon, size = 'default', className, children }: IconTextProps) {
  const s = sizeMap[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, s.text, className)}>
      <Icon className={s.icon} />
      {children}
    </span>
  );
}
