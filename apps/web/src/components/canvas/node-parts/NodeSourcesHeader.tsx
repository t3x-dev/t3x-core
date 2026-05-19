import type { PinType } from '@t3x-dev/core';
import { FileText, Pin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SourceType } from '@/types/nodes';
import { SOURCE_ICONS } from '../CanvasNodeUtils';
import { NodeKindIcon } from './NodeKindIcon';

export interface SourceItem {
  id: string;
  type: SourceType;
  label: string;
  title?: string;
}

export interface NodeSourcesHeaderProps {
  sources: SourceItem[];
  contextLabel: string | null;
  isPinned: (type: PinType, refId: string) => boolean;
  onOpenModal: () => void;
}

export function NodeSourcesHeader({
  sources,
  contextLabel,
  isPinned,
  onOpenModal,
}: NodeSourcesHeaderProps) {
  return (
    <div
      className="px-3 py-2 border-b border-[var(--stroke-divider)] rounded-t-[11px] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors nodrag"
      onClick={(e) => {
        e.stopPropagation();
        onOpenModal();
      }}
    >
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <NodeKindIcon kind="source" label="Source" />
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{sources.length}</span>
        {/* Context indicator */}
        {contextLabel && (
          <>
            <span className="text-[var(--text-tertiary)]/50">·</span>
            <span className="text-[var(--text-tertiary)] font-medium">{contextLabel}</span>
          </>
        )}
        <span className="text-[var(--text-tertiary)]/50">·</span>
        <TooltipProvider delayDuration={200}>
          {sources.map((source, idx) => {
            const Icon = SOURCE_ICONS[source.type] || FileText;
            const sourceIsPinned =
              source.type === 'conversation' && isPinned('conversation', source.id);
            return (
              <span key={source.id} className="inline-flex items-center gap-0.5">
                {idx > 0 && <span className="text-[var(--text-tertiary)]/50 mx-0.5">·</span>}
                {sourceIsPinned && (
                  <Pin
                    size={10}
                    className="text-[var(--status-warning)] fill-[var(--status-warning)]"
                  />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5">
                      <Icon size={10} className="text-[var(--text-tertiary)]" />
                      <span>{source.label}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {source.title || source.label}
                  </TooltipContent>
                </Tooltip>
              </span>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
