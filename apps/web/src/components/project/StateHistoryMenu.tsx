'use client';
import { ChevronDown, History } from 'lucide-react';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import styles from './StateOverviewView.module.css';

export function StateHistoryMenu({ href, canvasHref }: { href: string; canvasHref?: string }) {
  if (!canvasHref)
    return (
      <Link href={href} className={styles.sidebarLink}>
        <History /> History
      </Link>
    );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={styles.historyTrigger}>
          <History aria-hidden="true" /> History <ChevronDown aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="History views" className="grid w-44 gap-1 p-1">
        <Link href={href} className="rounded px-3 py-2 text-sm hover:bg-[var(--hover-bg)]">
          Commit history
        </Link>
        <Link href={canvasHref} className="rounded px-3 py-2 text-sm hover:bg-[var(--hover-bg)]">
          History canvas
        </Link>
      </PopoverContent>
    </Popover>
  );
}
