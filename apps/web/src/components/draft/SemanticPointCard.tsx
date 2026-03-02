'use client';

import { Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  undone: 'bg-red-100 text-red-800 line-through opacity-50',
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
            <span className="text-xs text-muted-foreground">
              {Math.round(point.confidence * 100)}%
            </span>
          )}
        </div>
      </div>
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
