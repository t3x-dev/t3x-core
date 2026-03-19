'use client';

import { Eye, FileText, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  deleteWorkbenchDraft,
  getWorkbenchDraft,
  promoteDraft,
  type WorkbenchDraft,
} from '@/lib/api';

interface PromotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoDraftId: string;
  onPromoted?: (draftId: string) => void;
  onViewFull?: (draftId: string) => void;
  onDiscarded?: () => void;
}

export function PromotePreviewDialog({
  open,
  onOpenChange,
  autoDraftId,
  onPromoted,
  onViewFull,
  onDiscarded,
}: PromotePreviewDialogProps) {
  const [draft, setDraft] = useState<WorkbenchDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!open || !autoDraftId) return;
    let cancelled = false;
    setDraft(null);
    setLoading(true);
    getWorkbenchDraft(autoDraftId)
      .then((d) => {
        if (!cancelled) setDraft(d);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, autoDraftId]);

  const handlePromote = async () => {
    setPromoting(true);
    try {
      await promoteDraft(autoDraftId);
      onPromoted?.(autoDraftId);
      onOpenChange(false);
    } catch {
      toast.error('Failed to promote draft');
    } finally {
      setPromoting(false);
    }
  };

  const sentenceCount = draft?.sentences.length ?? 0;
  const includedCount = draft?.sentences.filter((s) => s.included).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Auto-Draft Preview
          </DialogTitle>
          <DialogDescription>
            Review the auto-extracted draft before promoting to edit mode.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : draft ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{sentenceCount} sentences</Badge>
              <Badge variant="outline">{includedCount} included</Badge>
              {draft.constraints.length > 0 && (
                <Badge variant="outline">{draft.constraints.length} constraints</Badge>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-md border p-2">
              {draft.sentences.slice(0, 10).map((s) => (
                <div key={s.id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className={!s.included ? 'line-through opacity-50' : ''}>{s.text}</span>
                </div>
              ))}
              {sentenceCount > 10 && (
                <p className="text-xs text-muted-foreground/60 text-center pt-1">
                  ...and {sentenceCount - 10} more
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Could not load draft preview.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <div className="mr-auto flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Close
            </Button>
            {draft && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                disabled={discarding}
                onClick={async () => {
                  if (!window.confirm('Discard this auto-draft? This cannot be undone.')) return;
                  setDiscarding(true);
                  try {
                    await deleteWorkbenchDraft(autoDraftId);
                    toast.success('Auto-draft discarded');
                    onDiscarded?.();
                    onOpenChange(false);
                  } catch {
                    toast.error('Failed to discard draft');
                  } finally {
                    setDiscarding(false);
                  }
                }}
              >
                {discarding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Discard
              </Button>
            )}
          </div>
          {onViewFull && draft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onViewFull(autoDraftId);
                onOpenChange(false);
              }}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View Full
            </Button>
          )}
          <Button size="sm" onClick={handlePromote} disabled={promoting || !draft}>
            {promoting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            Promote to Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
