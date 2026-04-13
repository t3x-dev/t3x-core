'use client';

import { CheckCircle, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SemanticPointAPI } from '@/types/api';
import { SemanticPointCard } from './SemanticPointCard';

interface ReadyZoneProps {
  points: SemanticPointAPI[];
  onUndo: (id: string) => void;
}

export function ReadyZone({ points, onUndo }: ReadyZoneProps) {
  const inherited = points.filter((p) => p.status === 'inherited');
  const autoLanded = points.filter((p) => p.status === 'auto_landed');
  const otherLanded = points.filter(
    (p) => p.status !== 'inherited' && p.status !== 'auto_landed' && p.status !== 'undone'
  );
  const undone = points.filter((p) => p.status === 'undone');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        Ready Zone ({autoLanded.length + otherLanded.length + inherited.length})
      </h3>

      {inherited.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="h-3 w-3" aria-label="Inherited from parent" />
              </TooltipTrigger>
              <TooltipContent>Inherited from parent commit</TooltipContent>
            </Tooltip>
            <span>Inherited</span>
          </div>
          {inherited.map((p) => (
            <SemanticPointCard key={p.id} point={p} />
          ))}
        </div>
      )}

      {autoLanded.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle
              className="h-3 w-3 text-[var(--status-success)]"
              aria-label="Auto-landed"
            />
            <span>Auto-Landed</span>
          </div>
          {autoLanded.map((p) => (
            <SemanticPointCard key={p.id} point={p} onUndo={onUndo} showUndo />
          ))}
        </div>
      )}

      {otherLanded.length > 0 && (
        <div className="space-y-1.5">
          {(inherited.length > 0 || autoLanded.length > 0) && (
            <p className="text-xs text-muted-foreground">Extracted</p>
          )}
          {otherLanded.map((p) => (
            <SemanticPointCard key={p.id} point={p} onUndo={onUndo} showUndo />
          ))}
        </div>
      )}

      {undone.length > 0 && (
        <div className="space-y-1.5 opacity-60">
          <p className="text-xs text-muted-foreground">Undone</p>
          {undone.map((p) => (
            <SemanticPointCard key={p.id} point={p} />
          ))}
        </div>
      )}
    </div>
  );
}
