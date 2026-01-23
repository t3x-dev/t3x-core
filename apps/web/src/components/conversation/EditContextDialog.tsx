'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { usePinsStore } from '@/store/pinsStore';

interface EditContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  conversationId: string;
  currentSelection: string[] | null;
  onSave: (pinIds: string[] | null) => void;
}

export function EditContextDialog({
  open,
  onOpenChange,
  projectId,
  conversationId,
  currentSelection,
  onSave,
}: EditContextDialogProps) {
  const { pins } = usePinsStore();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [useAll, setUseAll] = useState(true);

  // Initialize selection when dialog opens
  useEffect(() => {
    if (open) {
      if (currentSelection === null) {
        setUseAll(true);
        setSelection(new Set(pins.map(p => p.id)));
      } else {
        setUseAll(false);
        setSelection(new Set(currentSelection));
      }
    }
  }, [open, currentSelection, pins]);

  const handleToggle = (pinId: string) => {
    setUseAll(false);
    setSelection(prev => {
      const next = new Set(prev);
      if (next.has(pinId)) {
        next.delete(pinId);
      } else {
        next.add(pinId);
      }
      return next;
    });
  };

  const handleUseAll = () => {
    setUseAll(true);
    setSelection(new Set(pins.map(p => p.id)));
  };

  const handleSave = () => {
    onSave(useAll ? null : Array.from(selection));
    onOpenChange(false);
  };

  const convPins = pins.filter(p => p.type === 'conversation');
  const leafPins = pins.filter(p => p.type === 'leaf');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Context</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Use all option */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={useAll}
              onCheckedChange={() => handleUseAll()}
            />
            <span>Use all pinned items (default)</span>
          </div>

          <div className="border-t pt-4">
            {/* Conversations */}
            {convPins.length > 0 && (
              <div className="mb-4">
                <div className="text-sm font-medium mb-2">Conversations</div>
                {convPins.map(pin => (
                  <div key={pin.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={selection.has(pin.id)}
                      onCheckedChange={() => handleToggle(pin.id)}
                      disabled={useAll}
                    />
                    <span className="text-sm">{pin.ref_id}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Leaves */}
            {leafPins.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Leaves</div>
                {leafPins.map(pin => (
                  <div key={pin.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={selection.has(pin.id)}
                      onCheckedChange={() => handleToggle(pin.id)}
                      disabled={useAll}
                    />
                    <span className="text-sm">{pin.ref_id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground border-t pt-4">
            {useAll
              ? `Using all ${pins.length} pins`
              : `Using ${selection.size} of ${pins.length} pins`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
