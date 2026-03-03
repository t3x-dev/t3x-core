'use client';

import { ArrowRight, Check, CheckCheck, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SemanticPointAPI } from '@/lib/api';
import { EvidenceDisplay } from './EvidenceDisplay';

interface ReviewItemProps {
  point: SemanticPointAPI;
  currentText?: string;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function ReviewItem({ point, currentText, onAccept, onDismiss, onEdit }: ReviewItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(point.text);

  // Sync editText when point.text changes (e.g., parent re-renders with updated data)
  useEffect(() => {
    if (!editing) {
      setEditText(point.text);
    }
  }, [point.text, editing]);

  const isModify = !!currentText;

  return (
    <div className="space-y-2 rounded-md border border-amber-200 dark:border-amber-800 p-3">
      {!editing ? (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            {isModify ? (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px]"
              >
                <Pencil className="mr-0.5 h-2.5 w-2.5" /> Modify
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px]"
              >
                <Plus className="mr-0.5 h-2.5 w-2.5" /> New
              </Badge>
            )}
            {point.inference_type && (
              <Badge variant="secondary" className="text-[10px]">
                {point.inference_type}
              </Badge>
            )}
            {point.confidence != null && (
              <span className="text-[10px] text-muted-foreground">
                {Math.round(point.confidence * 100)}%
              </span>
            )}
            {point.routing_reason && (
              <span className="text-[10px] text-muted-foreground italic">
                {point.routing_reason}
              </span>
            )}
          </div>

          {isModify ? (
            <div className="flex items-start gap-2 text-sm">
              <span className="rounded bg-muted px-1.5 py-0.5 line-through text-muted-foreground">
                {currentText}
              </span>
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="rounded bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 font-medium">
                {point.text}
              </span>
            </div>
          ) : (
            <p className="text-sm font-medium">{point.text}</p>
          )}

          <EvidenceDisplay evidence={point.evidence} />

          <div className="flex items-center gap-1.5 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/30"
              onClick={() => onAccept(point.id)}
            >
              <Check className="mr-1 h-3 w-3" /> {isModify ? 'Accept Change' : 'Accept'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950/30"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => onDismiss(point.id)}
            >
              <X className="mr-1 h-3 w-3" /> {isModify ? 'Keep Current' : 'Dismiss'}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={!editText.trim()}
              onClick={() => {
                onEdit(point.id, editText);
                setEditing(false);
              }}
            >
              <CheckCheck className="mr-1 h-3 w-3" /> Save & Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditText(point.text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
