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
  auto_landed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  modified: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  reinforced: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  undone: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 line-through opacity-50',
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
          {point.confidence != null && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
              {point.confidence.toFixed(2)}
            </Badge>
          )}
          {point.low_coverage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle
                  className="h-3 w-3 text-amber-500 cursor-help"
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
