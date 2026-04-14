'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/cn';

/**
 * Breadcrumb — navigation context for detail pages.
 *
 * Spec: frontend-art-template §4.4
 * - Each segment is a Link except the last (current page)
 * - Separator: ChevronRight at h-3.5 w-3.5 text-muted-foreground/50
 * - Long names truncate with max-w-[200px]
 */

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  className?: string;
}

export function Breadcrumb({ segments, className }: BreadcrumbProps) {
  return (
    <nav className={cn('flex items-center gap-1.5 text-sm', className)}>
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={segment.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
            {isLast || !segment.href ? (
              <span className="max-w-[200px] truncate font-medium text-foreground">
                {segment.label}
              </span>
            ) : (
              <Link
                href={segment.href}
                className="max-w-[200px] truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {segment.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
