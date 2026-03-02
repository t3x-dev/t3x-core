'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SemanticPointAPI } from '@/lib/api';
import { ReviewItem } from './ReviewItem';

interface ReviewZoneProps {
  points: SemanticPointAPI[];
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function ReviewZone({ points, onAccept, onDismiss, onEdit }: ReviewZoneProps) {
  const [expanded, setExpanded] = useState(points.length > 0);

  if (points.length === 0) return null;

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
          {points.map((p) => (
            <ReviewItem
              key={p.id}
              point={p}
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
