'use client';

import type { SemanticPointAPI } from '@/lib/api';
import { SemanticPointCard } from './SemanticPointCard';

interface ReadyZoneProps {
  points: SemanticPointAPI[];
  onUndo: (id: string) => void;
}

export function ReadyZone({ points, onUndo }: ReadyZoneProps) {
  const inherited = points.filter((p) => p.status === 'inherited');
  const landed = points.filter((p) => p.status !== 'inherited' && p.status !== 'undone');
  const undone = points.filter((p) => p.status === 'undone');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Ready Zone ({landed.length + inherited.length})</h3>

      {inherited.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Inherited</p>
          {inherited.map((p) => (
            <SemanticPointCard key={p.id} point={p} />
          ))}
        </div>
      )}

      {landed.length > 0 && (
        <div className="space-y-1.5">
          {inherited.length > 0 && <p className="text-xs text-muted-foreground">Extracted</p>}
          {landed.map((p) => (
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
