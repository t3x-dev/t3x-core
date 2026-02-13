'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCanvasStore } from '@/store/canvasStore';

export function DeletionConfirmDialog() {
  const deletionConfirmation = useCanvasStore((state) => state.deletionConfirmation);
  const confirmDeletion = useCanvasStore((state) => state.confirmDeletion);
  const cancelDeletion = useCanvasStore((state) => state.cancelDeletion);

  if (!deletionConfirmation) {
    return null;
  }

  const { message, nodeIds, edgeIds } = deletionConfirmation;
  const itemCount = nodeIds.length + edgeIds.length;

  const summaryParts: string[] = [];
  if (nodeIds.length > 0) summaryParts.push(`${nodeIds.length} node(s)`);
  if (edgeIds.length > 0) summaryParts.push(`${edgeIds.length} connection(s)`);
  const summary = summaryParts.join(' and ') + ' will be removed.';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && cancelDeletion()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription asChild>
          <div className="space-y-[var(--space-item)]">
            {message.split('\n').map((line, idx) => (
              <p key={idx} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
            <p className="text-sm font-medium text-foreground">{summary}</p>
          </div>
        </DialogDescription>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={cancelDeletion}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDeletion}>
            Delete{itemCount > 1 ? ` (${itemCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
