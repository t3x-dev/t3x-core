'use client';

/**
 * AddManualSentenceDialog - Dialog for adding a manual sentence to the draft
 */

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
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

interface AddManualSentenceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddManualSentenceDialog({ open, onClose }: AddManualSentenceDialogProps) {
  const { addManualSentence } = useDraftWorkspaceStore();
  const [text, setText] = useState('');

  const handleAdd = () => {
    if (!text.trim()) return;
    addManualSentence(text);
    setText('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sentence</DialogTitle>
          <DialogDescription>Add a manually composed sentence to the draft.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter sentence text..."
          rows={3}
          className="resize-none"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!text.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
