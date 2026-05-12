'use client';

/**
 * ChatSpanActions — the inline edit popover that appears when the user
 * selects text in a chat turn during the review phase.
 */

import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { SyntheticEvent } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type InlineTextAction, useSourceTextDraft } from '@/hooks/shared/useSourceTextDraft';
import type { TextSelectionResult } from '@/hooks/shared/useTextSelection';
import { cn } from '@/utils/cn';

interface ChatSpanActionsProps {
  selection: TextSelectionResult;
  onDone: () => void;
}

export function ChatSpanActions({ selection, onDone }: ChatSpanActionsProps) {
  const { applySourceTextEdit, pending, enabled } = useSourceTextDraft();
  const [action, setAction] = useState<InlineTextAction>('add');
  const [text, setText] = useState('');

  const needsText = action === 'add' || action === 'edit';
  const canConfirm = enabled && !pending && (!needsText || text.trim().length > 0);

  async function handleConfirm() {
    if (!canConfirm) return;
    try {
      await applySourceTextEdit({
        action,
        turnHash: selection.turnHash,
        turnRole: selection.turnRole,
        text: selection.text,
        turnText: selection.turnText,
        start: selection.startChar,
        end: selection.endChar,
        replacementText: text,
      });
      toast.success('Source text updated — re-extract to refresh YOps');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Source edit failed');
    }
  }

  function selectAction(nextAction: InlineTextAction) {
    setAction(nextAction);
    if (nextAction === 'delete') return;
    setText(nextAction === 'edit' ? selection.text : '');
  }

  const preview = selection.text.length > 80 ? `${selection.text.slice(0, 80)}…` : selection.text;

  function stopSelectionDismissal(event: SyntheticEvent) {
    event.stopPropagation();
  }

  return (
    <div
      data-testid="chat-span-actions"
      data-selection-popover="true"
      onPointerDown={stopSelectionDismissal}
      onPointerUp={stopSelectionDismissal}
      onMouseDown={stopSelectionDismissal}
      onMouseUp={stopSelectionDismissal}
      onClick={stopSelectionDismissal}
      className="mx-3 my-2 p-2.5 bg-[var(--surface-panel)] border border-[var(--status-info)]/30 rounded-lg space-y-2"
    >
      <div className="text-[10px] text-[var(--text-tertiary)] font-mono bg-[var(--surface-panel-alt)] rounded px-1.5 py-1 truncate">
        &ldquo;{preview}&rdquo;
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => selectAction('add')}
          title="Insert text after the selected source text"
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold',
            action === 'add'
              ? 'bg-[var(--status-success)] text-[var(--on-status)]'
              : 'border border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
        >
          <Plus className="w-3 h-3" />
          Insert after
        </button>
        <button
          type="button"
          onClick={() => selectAction('edit')}
          title="Replace the selected source text"
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold',
            action === 'edit'
              ? 'bg-[var(--status-info)] text-[var(--on-status)]'
              : 'border border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
        >
          <Pencil className="w-3 h-3" />
          Replace
        </button>
        <button
          type="button"
          onClick={() => selectAction('delete')}
          title="Delete the selected source text"
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold',
            action === 'delete'
              ? 'bg-[var(--status-error)] text-[var(--on-status)]'
              : 'border border-[var(--status-error)]/40 text-[var(--status-error)] hover:bg-[var(--status-error)]/10'
          )}
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>

        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="ml-auto px-2 py-1 rounded text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {action !== 'delete' && (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={action === 'add' ? 'Text to insert after selection' : 'Replacement text'}
          className="h-16 w-full resize-none rounded border border-[var(--stroke-default)] bg-transparent px-2 py-1.5 text-[11px] leading-4 text-[var(--text-primary)] outline-none focus:border-[var(--status-info)]"
        />
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="inline-flex items-center rounded bg-[var(--source)] px-2.5 py-1 text-[10px] font-semibold text-[var(--on-accent)] disabled:opacity-50"
      >
        {pending ? 'Staging…' : 'Confirm'}
      </button>
    </div>
  );
}
