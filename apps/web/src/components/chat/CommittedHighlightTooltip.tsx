'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CommittedHighlight } from '@/lib/committedHighlights';

interface CommittedHighlightTooltipProps {
  highlight: CommittedHighlight;
  children: React.ReactNode;
}

export function CommittedHighlightTooltip({
  highlight,
  children,
}: CommittedHighlightTooltipProps) {
  const shortHash = highlight.commitHash.replace('sha256:', '').slice(0, 8);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs text-xs"
        >
          <p className="font-medium text-[var(--text-primary)]">
            → {highlight.nodeText.length > 60
              ? `${highlight.nodeText.slice(0, 60)}...`
              : highlight.nodeText}
          </p>
          <p className="text-[var(--text-tertiary)] mt-0.5">
            {highlight.branch} · {shortHash}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
