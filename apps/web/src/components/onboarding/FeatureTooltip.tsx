'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 't3x-tips-seen';

function getSeenTips(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function markTipSeen(tipId: string) {
  const seen = getSeenTips();
  seen[tipId] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}

interface FeatureTooltipProps {
  tipId: string;
  content: string;
  /** Whether the trigger condition is met */
  active: boolean;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function FeatureTooltip({
  tipId,
  content,
  active,
  children,
  side = 'bottom',
}: FeatureTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const seen = getSeenTips();
    if (!seen[tipId]) {
      setVisible(true);
    }
  }, [active, tipId]);

  const handleDismiss = useCallback(() => {
    markTipSeen(tipId);
    setVisible(false);
  }, [tipId]);

  return (
    <Tooltip open={visible}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        className={cn(
          glass.elevatedBase,
          'border-l-2 border-l-[var(--accent-commit)] rounded-lg p-0 max-w-xs'
        )}
      >
        <div className="px-3 py-2">
          <p className="text-sm text-[var(--text-primary)]">{content}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="mt-1.5 h-6 px-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Got it
          </Button>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Tip ID constants for reference */
export const TIP_IDS = {
  FIRST_CONV: 'tip-first-conv',
  COMMIT_READY: 'tip-commit-ready',
  MEMORY: 'tip-memory',
  BRANCH: 'tip-branch',
} as const;
