'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { typo } from '@/lib/typography';
import { cn } from '@/lib/utils';

/**
 * CollapsibleSection — standard component for Layer 2 (collapsed by default) content.
 *
 * Spec: frontend-art-template §5.9, frontend-rules.md Rule 3
 * - Uses typo.subTitle for title
 * - Framer Motion AnimatePresence for smooth height animation (200ms ease-smooth)
 * - Optional badge count in header
 * - defaultOpen prop for initial state
 */

interface CollapsibleSectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className={typo.subTitle}>{title}</span>
        <div className="flex items-center gap-2">
          {badge != null && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {badge}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
