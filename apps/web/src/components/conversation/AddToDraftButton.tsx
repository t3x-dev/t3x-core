'use client';

/**
 * AddToDraftButton - Floating button that appears near text selection
 *
 * Behavior:
 * - 0 editing drafts: Quick Collect (auto-create draft + add sentence)
 * - 1 editing draft: Add directly to that draft
 * - >1 editing drafts: Open DraftPickerDialog
 */

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useTerminology } from '@/hooks/useTerminology';
import type { TextSelectionResult } from '@/hooks/useTextSelection';
import type { WorkbenchDraft } from '@/lib/api';
import { createWorkbenchDraft, listWorkbenchDrafts, updateWorkbenchDraft } from '@/lib/api';
import { nextDraftId } from '@/lib/draftUtils';
import { DraftPickerDialog } from './DraftPickerDialog';

interface AddToDraftButtonProps {
  selection: TextSelectionResult;
  projectId: string;
  conversationId: string;
  conversationTitle?: string;
  onDone: () => void;
}

function buildSentence(
  text: string,
  sel: TextSelectionResult,
  conversationId: string,
  conversationTitle: string | undefined,
  position: number
) {
  return {
    id: nextDraftId('ds_'),
    text,
    origin: { type: 'selected' as const },
    source: {
      conversation_id: conversationId,
      conversation_title: conversationTitle,
      turn_hash: sel.turnHash,
      role: sel.turnRole,
      start_char: sel.startChar,
      end_char: sel.endChar,
    },
    position,
    included: true,
  };
}

export function AddToDraftButton({
  selection,
  projectId,
  conversationId,
  conversationTitle,
  onDone,
}: AddToDraftButtonProps) {
  const { t } = useTerminology();
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [acting, setActing] = useState(false);

  // Memoize position from selection rect
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const { rect } = selection;
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [selection]);

  const quickCollect = async () => {
    const titlePrefix = conversationTitle ? conversationTitle.slice(0, 20) : 'Selection';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const autoTitle = `${t('draft')} · ${titlePrefix} · ${dateStr}`;

    const newDraft = await createWorkbenchDraft({ project_id: projectId, title: autoTitle });
    const sentence = buildSentence(selection.text, selection, conversationId, conversationTitle, 0);
    await updateWorkbenchDraft(newDraft.id, { sentences: [sentence], if_revision: 1 });

    toast.success(`Added to "${autoTitle}"`, {
      action: {
        label: 'Open',
        onClick: () => {
          router.push(`/project/${projectId}/draft/${newDraft.id}`);
        },
      },
    });
    onDone();
  };

  const addToDraft = async (draft: WorkbenchDraft) => {
    const sentence = buildSentence(
      selection.text,
      selection,
      conversationId,
      conversationTitle,
      draft.sentences.length
    );
    const updatedSentences = [...draft.sentences, sentence];
    await updateWorkbenchDraft(draft.id, { sentences: updatedSentences, if_revision: draft.revision });

    toast.success(`Added to "${draft.title}"`, {
      action: {
        label: 'Open',
        onClick: () => {
          router.push(`/project/${projectId}/draft/${draft.id}`);
        },
      },
    });
    onDone();
  };

  const handleClick = async () => {
    setActing(true);
    try {
      const drafts = await listWorkbenchDrafts(projectId, 'editing');

      if (drafts.length === 0) {
        await quickCollect();
      } else if (drafts.length === 1) {
        await addToDraft(drafts[0]);
      } else {
        setShowPicker(true);
        setActing(false);
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to draft');
    } finally {
      setActing(false);
    }
  };

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={acting}
      style={{
        position: 'absolute',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 9999,
      }}
      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
      Add to Draft
    </button>
  );

  return (
    <>
      {typeof document !== 'undefined' && createPortal(button, document.body)}
      <DraftPickerDialog
        open={showPicker}
        onClose={() => {
          setShowPicker(false);
          onDone();
        }}
        projectId={projectId}
        selectedText={selection.text}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        turnHash={selection.turnHash}
        turnRole={selection.turnRole}
        startChar={selection.startChar}
        endChar={selection.endChar}
      />
    </>
  );
}
