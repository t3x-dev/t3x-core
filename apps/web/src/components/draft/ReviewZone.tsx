'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SemanticPointAPI } from '@/infrastructure';
import { ReviewItem } from './ReviewItem';

type ReviewFilter = 'all' | 'new' | 'modify';

interface ReviewZoneProps {
  points: SemanticPointAPI[];
  existingNodeTexts?: Map<string, string>;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function ReviewZone({
  points,
  existingNodeTexts,
  onAccept,
  onDismiss,
  onEdit,
}: ReviewZoneProps) {
  const [expanded, setExpanded] = useState(points.length > 0);
  const [filter, setFilter] = useState<ReviewFilter>('all');

  if (points.length === 0) return null;

  const isModify = (p: SemanticPointAPI) => existingNodeTexts?.has(p.id) ?? false;
  const filtered =
    filter === 'all'
      ? points
      : points.filter((p) => (filter === 'modify' ? isModify(p) : !isModify(p)));

  const newCount = points.filter((p) => !isModify(p)).length;
  const modifyCount = points.filter((p) => isModify(p)).length;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Review Zone
        <Badge variant="secondary">{points.length}</Badge>
      </button>

      {expanded && (
        <div className="space-y-2 pl-2">
          {points.length > 1 && newCount > 0 && modifyCount > 0 && (
            <div className="flex items-center gap-1">
              {(['all', 'new', 'modify'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'secondary' : 'ghost'}
                  className="h-6 text-xs px-2"
                  onClick={() => setFilter(f)}
                >
                  {f === 'all'
                    ? `All (${points.length})`
                    : f === 'new'
                      ? `New (${newCount})`
                      : `Modify (${modifyCount})`}
                </Button>
              ))}
            </div>
          )}
          {filtered.map((p) => (
            <ReviewItem
              key={p.id}
              point={p}
              currentText={existingNodeTexts?.get(p.id)}
              onAccept={onAccept}
              onDismiss={onDismiss}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
