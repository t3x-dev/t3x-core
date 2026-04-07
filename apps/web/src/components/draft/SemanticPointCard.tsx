'use client';

import { AlertTriangle, Info, Lock, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SemanticPointAPI } from '@/lib/api';

interface SemanticPointCardProps {
  point: SemanticPointAPI;
  onUndo?: (id: string) => void;
  showUndo?: boolean;
}

const statusColors: Record<string, string> = {
  inherited: 'bg-muted text-muted-foreground',
  auto_landed: 'bg-[var(--status-success-muted)] text-[var(--status-success)]',
  reviewed: 'bg-[var(--status-info-muted)] text-[var(--status-info)]',
  modified: 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
  reinforced: 'bg-[var(--status-success-muted)] text-[var(--status-success)]',
  undone: 'bg-[var(--status-error-muted)] text-[var(--status-error)] line-through opacity-50',
};

export function SemanticPointCard({ point, onUndo, showUndo }: SemanticPointCardProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-3 ${point.status === 'undone' ? 'opacity-50' : ''}`}
    >
      <div className="flex-1 space-y-1">
        <p className="text-sm">{point.text}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={statusColors[point.status] ?? ''}>
            {point.status}
          </Badge>
          {point.inference_type && (
            <Badge variant="secondary" className="text-xs">
              {point.inference_type}
            </Badge>
          )}
          {point.low_coverage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle
                  className="h-3 w-3 text-[var(--status-warning)] cursor-help"
                  aria-label="Low evidence coverage"
                />
              </TooltipTrigger>
              <TooltipContent>Evidence covers &lt;60% of source turn</TooltipContent>
            </Tooltip>
          )}
          {point.routing_reason && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info
                  className="h-3 w-3 text-muted-foreground cursor-help"
                  aria-label="Routing reason"
                />
              </TooltipTrigger>
              <TooltipContent>{point.routing_reason}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {point.status === 'inherited' && !showUndo && (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Inherited" />
      )}
      {showUndo && point.status !== 'undone' && onUndo && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onUndo(point.id)}
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
