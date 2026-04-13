'use client';

/**
 * ExtractConversationDialog — Select a conversation and extract nodes to draft.
 *
 * Phase 1: Conversation picker (list from project)
 * Phase 2: Extracting (loading spinner)
 * Phase 3: Result toast + close
 */

import { Loader2, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type Conversation, extractToDraft, listConversations } from '@/infrastructure';
import { cn } from '@/lib/utils';

interface ExtractConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  projectId: string;
  onExtracted: () => void;
}

export function ExtractConversationDialog({
  open,
  onOpenChange,
  draftId,
  projectId,
  onExtracted,
}: ExtractConversationDialogProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Load conversations when dialog opens
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;

    setLoading(true);
    setSelectedId(null);

    listConversations(projectId)
      .then((data) => {
        if (!cancelled) setConversations(data.conversations);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const handleExtract = useCallback(async () => {
    if (!selectedId) return;
    setExtracting(true);
    try {
      const result = await extractToDraft(draftId, selectedId);
      toast.success(`Added ${result.added_count} nodes to draft`);
      onExtracted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [draftId, selectedId, onExtracted, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Extract from Conversation</DialogTitle>
          <DialogDescription>
            Select a conversation to extract nodes from and append to this draft.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && conversations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No conversations found in this project.
            </p>
          )}

          {!loading && conversations.length > 0 && (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.conversation_id}
                  type="button"
                  onClick={() => setSelectedId(conv.conversation_id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    selectedId === conv.conversation_id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50'
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conv.title || conv.conversation_id.slice(0, 20)}
                    </p>
                    {conv.turns_count != null && (
                      <p className="text-xs text-muted-foreground">{conv.turns_count} turns</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExtract} disabled={!selectedId || extracting}>
            {extracting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
