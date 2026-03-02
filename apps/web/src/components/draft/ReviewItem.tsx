'use client';

import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SemanticPointAPI } from '@/lib/api';
import { EvidenceDisplay } from './EvidenceDisplay';
import { SemanticPointCard } from './SemanticPointCard';

interface ReviewItemProps {
  point: SemanticPointAPI;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function ReviewItem({ point, onAccept, onDismiss, onEdit }: ReviewItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(point.text);

  return (
    <div className="space-y-2 rounded-md border border-amber-200 dark:border-amber-800 p-3">
      {!editing ? (
        <>
          <SemanticPointCard point={point} />
          <EvidenceDisplay evidence={point.evidence} />
          <div className="flex items-center gap-1.5 pt-1">
            <Button size="sm" variant="outline" onClick={() => onAccept(point.id)}>
              <Check className="mr-1 h-3 w-3" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(point.id)}>
              <X className="mr-1 h-3 w-3" /> Dismiss
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() => {
                onEdit(point.id, editText);
                setEditing(false);
              }}
            >
              Save
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
