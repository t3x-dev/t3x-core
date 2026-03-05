'use client';

/**
 * DraftPickerDialog - Dialog for choosing which draft to add selected text to
 *
 * Lists editing drafts for the project with options:
 * - Quick Collect (create new draft automatically)
 * - Select existing editing draft
 * - Create new draft
 */

import { FileEdit, Loader2, Plus, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTerminology } from '@/hooks/useTerminology';
import type { DraftSentence, DraftV3 } from '@/lib/api';
import { createDraftV3, listDraftsV3, updateDraftV3 } from '@/lib/api';
import { nextDraftId } from '@/lib/draftUtils';
import { cn } from '@/lib/utils';

interface DraftPickerDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  selectedText: string;
  conversationId: string;
  conversationTitle?: string;
  turnHash: string;
  turnRole: string;
  startChar: number;
  endChar: number;
}

function buildSentence(
  text: string,
  conversationId: string,
  conversationTitle: string | undefined,
  turnHash: string,
  turnRole: string,
  startChar: number,
  endChar: number,
  position: number
): DraftSentence {
  return {
    id: nextDraftId('ds_'),
    text,
    origin: { type: 'selected' as const },
    source: {
      conversation_id: conversationId,
      conversation_title: conversationTitle,
      turn_hash: turnHash,
      role: turnRole,
      start_char: startChar,
      end_char: endChar,
    },
    position,
    included: true,
  };
}

export function DraftPickerDialog({
  open,
  onClose,
  projectId,
  selectedText,
  conversationId,
  conversationTitle,
  turnHash,
  turnRole,
  startChar,
  endChar,
}: DraftPickerDialogProps) {
  const { t } = useTerminology();
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftV3[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // Fetch editing drafts when dialog opens
  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listDraftsV3(projectId, 'editing')
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const handleQuickCollect = async () => {
    setActing(true);
    try {
      const titlePrefix = conversationTitle ? conversationTitle.slice(0, 20) : 'Selection';
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const autoTitle = `${t('draft')} · ${titlePrefix} · ${dateStr}`;

      const newDraft = await createDraftV3({ project_id: projectId, title: autoTitle });
      const sentence = buildSentence(
        selectedText,
        conversationId,
        conversationTitle,
        turnHash,
        turnRole,
        startChar,
        endChar,
        0
      );
      await updateDraftV3(newDraft.id, { sentences: [sentence], if_revision: 1 });

      toast.success(`Added to "${autoTitle}"`, {
        action: {
          label: 'Open',
          onClick: () => {
            router.push(`/project/${projectId}/draft/${newDraft.id}`);
          },
        },
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setActing(false);
    }
  };

  const handleAddToDraft = async (draft: DraftV3) => {
    setActing(true);
    try {
      const sentence = buildSentence(
        selectedText,
        conversationId,
        conversationTitle,
        turnHash,
        turnRole,
        startChar,
        endChar,
        draft.sentences.length
      );
      const updatedSentences = [...draft.sentences, sentence];
      await updateDraftV3(draft.id, { sentences: updatedSentences, if_revision: draft.revision });

      toast.success(`Added to "${draft.title}"`, {
        action: {
          label: 'Open',
          onClick: () => {
            router.push(`/project/${projectId}/draft/${draft.id}`);
          },
        },
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to draft');
    } finally {
      setActing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Draft</DialogTitle>
        </DialogHeader>

        {/* Selected text preview */}
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-3">
          &ldquo;{selectedText}&rdquo;
        </div>

        <div className="space-y-1">
          {/* Quick Collect */}
          <button
            type="button"
            onClick={handleQuickCollect}
            disabled={acting}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
              'hover:bg-[var(--hover-bg)] transition-colors',
              acting && 'opacity-50 pointer-events-none'
            )}
          >
            <Zap className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Quick Collect</p>
              <p className="text-xs text-muted-foreground">Create new draft automatically</p>
            </div>
          </button>

          {/* Divider */}
          {drafts.length > 0 && <div className="border-t my-1" />}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Existing drafts */}
          {!loading &&
            drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => handleAddToDraft(d)}
                disabled={acting}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                  'hover:bg-[var(--hover-bg)] transition-colors',
                  acting && 'opacity-50 pointer-events-none'
                )}
              >
                <FileEdit className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm truncate flex-1">{d.title || 'Untitled'}</span>
                <span className="text-xs text-muted-foreground shrink-0">{d.sentences.length}</span>
              </button>
            ))}

          {/* Divider */}
          <div className="border-t my-1" />

          {/* Create new */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm"
            disabled={acting}
            onClick={handleQuickCollect}
          >
            <Plus className="h-4 w-4" />
            Create New Draft...
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
