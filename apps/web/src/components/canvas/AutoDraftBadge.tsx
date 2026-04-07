'use client';

import { Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { PromotePreviewDialog } from '@/components/draft/PromotePreviewDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AutoDraftBadgeProps {
  autoDraftId: string;
  onPromoted?: (draftId: string) => void;
}

/**
 * Badge shown on conversation nodes that have an auto-draft available.
 * Click to open a preview dialog before promoting.
 */
export function AutoDraftBadge({ autoDraftId, onPromoted }: AutoDraftBadgeProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDialogOpen(true);
  }, []);

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-[var(--source)]/40 text-[var(--source)] bg-[var(--source-dim)] hover:bg-[var(--source)]/15 transition-colors nodrag"
              onClick={handleClick}
            >
              <Sparkles size={10} />
              Auto-Draft
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Click to preview auto-draft
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PromotePreviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        autoDraftId={autoDraftId}
        onPromoted={(id) => {
          setDialogOpen(false);
          onPromoted?.(id);
        }}
      />
    </>
  );
}
