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
    <div className="flex items-center gap-3 border-b border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-4 py-2">
      <AlertTriangle className="h-4 w-4 text-[var(--status-warning)] shrink-0" />
      <p className="text-sm text-[var(--status-warning)] flex-1">
        This draft was modified in another tab. Refresh to see the latest version.
      </p>
      <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5 shrink-0">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
