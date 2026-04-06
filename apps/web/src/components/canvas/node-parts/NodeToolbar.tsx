import { Position, NodeToolbar as XYFlowNodeToolbar } from '@xyflow/react';
import { GitMerge, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface NodeToolbarProps {
  branchType?: string;
  canTriggerMerge: boolean;
  onAddUnit: () => void;
  onMerge: () => void;
  t: (key: string) => string;
}

export function NodeToolbar({
  branchType,
  canTriggerMerge,
  onAddUnit,
  onMerge,
  t,
}: NodeToolbarProps) {
  return (
    <XYFlowNodeToolbar position={Position.Right} offset={8} className="flex gap-1.5 nodrag">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="canvas-outline"
              size="icon-sm"
              className="rounded-full hover:border-[var(--status-info)]/60 hover:bg-[var(--status-info-muted)] hover:text-[var(--status-info)]"
              onClick={onAddUnit}
              aria-label="Add Unit"
            >
              <MessageSquarePlus size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={4}>
            <p className="text-xs">Continue conversation</p>
          </TooltipContent>
        </Tooltip>
        {branchType === 'branch' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="canvas-outline"
                size="icon-sm"
                className="rounded-full hover:border-[var(--accent-pending)]/60 hover:bg-[var(--accent-pending)]/10 hover:text-[var(--accent-pending)] disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onMerge}
                aria-label="Start Merge"
                disabled={!canTriggerMerge}
              >
                <GitMerge size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              <p className="text-xs">
                {canTriggerMerge
                  ? `${t('merge')} ${t('branch')} to main`
                  : `${t('merge')} requires main ${t('branch')} ${t('commit')}`}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </XYFlowNodeToolbar>
  );
}
