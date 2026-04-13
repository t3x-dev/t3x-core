'use client';

/**
 * NodeCard - Single node in the draft workspace
 *
 * Shows checkbox (included), text, source badge, remove button,
 * and inline constraint validation results (Error Lens pattern).
 */

import { AlertTriangle, CheckCircle, GripVertical, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DraftNode } from '@/infrastructure';
import { getConstraintResultsForNode } from '@/lib/draftValidation';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

interface NodeCardProps {
  node: DraftNode;
  inherited?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function NodeCard({
  node,
  inherited = false,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: NodeCardProps) {
  const { toggleNode, removeNode } = useDraftWorkspaceStore();
  const constraints = useDraftWorkspaceStore((s) => s.draft?.constraints ?? []);
  const [locked, setLocked] = useState(inherited);

  // Sync locked state when inherited prop changes
  useEffect(() => {
    setLocked(inherited);
  }, [inherited]);

  const constraintResults = useMemo(
    () => getConstraintResultsForNode(node, constraints),
    [node, constraints]
  );

  const originLabel = getOriginLabel(node);

  return (
    <div
      data-node-id={node.id}
      draggable={!locked}
      onDragStart={locked ? undefined : onDragStart}
      onDragOver={locked ? undefined : onDragOver}
      onDrop={locked ? undefined : onDrop}
      onDragEnd={locked ? undefined : onDragEnd}
      className={`group flex items-start gap-2 rounded-lg border p-3 transition-colors ${
        locked
          ? 'border-border/50 bg-muted/50'
          : node.included
            ? 'border-border bg-[var(--surface-card)]'
            : 'border-border/50 bg-muted/30 opacity-60'
      } ${isDragOver ? 'border-primary border-t-2' : ''}`}
    >
      {/* Drag handle or Lock */}
      {locked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-0.5 shrink-0"
              onClick={() => {
                if (window.confirm('Unlock this inherited node for editing?')) {
                  setLocked(false);
                }
              }}
              aria-label="Unlock inherited node"
            >
              <Lock className="h-4 w-4 text-muted-foreground/60" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Inherited from parent. Click to unlock.</TooltipContent>
        </Tooltip>
      ) : (
        <GripVertical className="h-4 w-4 mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing" />
      )}

      {/* Include checkbox */}
      <Checkbox
        checked={node.included}
        onCheckedChange={() => toggleNode(node.id)}
        className="mt-0.5"
        disabled={locked}
        aria-label={node.included ? 'Exclude node' : 'Include node'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-relaxed ${locked ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {node.text}
        </p>
        {originLabel && (
          <Badge variant="secondary" className="mt-1.5 text-xs">
            {originLabel}
          </Badge>
        )}
        {/* Inline constraint validation (Error Lens pattern) */}
        {constraintResults.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {constraintResults.map((r) => (
              <div
                key={r.constraint_id}
                className={`flex items-center gap-1.5 text-xs ${
                  r.type === 'match'
                    ? 'text-[var(--status-success)]'
                    : 'text-[var(--status-error)]'
                }`}
              >
                {r.type === 'match' ? (
                  <CheckCircle className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                )}
                <span>
                  {r.type === 'match' ? 'matches' : 'violates'} {r.constraint.type} &ldquo;
                  {r.constraint.value}&rdquo;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove button (hidden when locked) */}
      {!locked && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={() => removeNode(node.id)}
          aria-label="Remove node"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function getOriginLabel(node: DraftNode): string | null {
  if (node.origin.type === 'manual') return 'Manual';
  if (node.source?.conversation_title) {
    return node.source.conversation_title;
  }
  if (node.origin.type === 'extracted') return 'Extracted';
  if (node.origin.type === 'selected') return 'Selected';
  return null;
}
