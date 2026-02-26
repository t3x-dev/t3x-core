'use client';

/**
 * ConflictBanner - Shown when a 409 revision conflict occurs during save
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConflictBannerProps {
  onRefresh: () => void;
}

export function ConflictBanner({ onRefresh }: ConflictBannerProps) {
  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-2">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
        This draft was modified in another tab. Refresh to see the latest version.
      </p>
      <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5 shrink-0">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
