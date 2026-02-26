'use client';

/**
 * CommitDraftDialog - Confirmation dialog before committing a draft
 *
 * Shows summary, optional commit message, and commit button.
 */

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CommitDraftDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (message?: string) => Promise<void>;
  includedCount: number;
  constraintCount: number;
}

export function CommitDraftDialog({
  open,
  onClose,
  onConfirm,
  includedCount,
  constraintCount,
}: CommitDraftDialogProps) {
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      await onConfirm(message.trim() || undefined);
      setMessage('');
    } catch {
      // Error handled by store
    } finally {
      setCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Commit Draft</DialogTitle>
          <DialogDescription>
            This will create a new commit with {includedCount} sentence
            {includedCount !== 1 ? 's' : ''}
            {constraintCount > 0 &&
              ` and ${constraintCount} constraint${constraintCount !== 1 ? 's' : ''}`}
            .
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commit message (optional)"
          rows={2}
          className="resize-none"
          autoFocus
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={committing || includedCount === 0}>
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Committing...
              </>
            ) : (
              'Commit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
