'use client';

import { useCallback, useState } from 'react';
import {
  applySourceTextDraftEdit,
  type SourceTextAction,
  type SourceTextTurnRole,
} from '@/domain/sourceTextDrafts';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type InlineTextAction = SourceTextAction;

export interface SourceTextEditTarget {
  action: SourceTextAction;
  turnHash: string;
  turnRole?: string;
  text: string;
  turnText?: string;
  start: number;
  end: number;
  replacementText?: string;
}

function normalizeTurnRole(role: string | undefined): SourceTextTurnRole {
  switch (role) {
    case 'user':
    case 'assistant':
    case 'system':
    case 'tool':
      return role;
    default:
      return 'assistant';
  }
}

export function useSourceTextDraft() {
  const [pending, setPending] = useState(false);

  const applySourceTextEdit = useCallback(async (target: SourceTextEditTarget): Promise<void> => {
    setPending(true);
    try {
      const store = useWorkspaceStore.getState();
      const existingDraft = store.sourceTextDrafts[target.turnHash] ?? null;
      const turn = store.turns.find((candidate) => candidate.turn_hash === target.turnHash);
      const baseContent = existingDraft?.baseContent ?? turn?.content ?? target.turnText;
      if (!baseContent) {
        throw new Error('Cannot edit source text: source turn is not loaded.');
      }

      const draft = applySourceTextDraftEdit({
        baseContent,
        existingDraft,
        input: {
          turnHash: target.turnHash,
          turnRole: turn?.role ?? normalizeTurnRole(target.turnRole),
          action: target.action,
          start: target.start,
          end: target.end,
          selectedText: target.text,
          replacementText: target.replacementText,
        },
      });
      useWorkspaceStore.getState().setSourceTextDraft(target.turnHash, draft);
    } finally {
      setPending(false);
    }
  }, []);

  return { applySourceTextEdit, pending, enabled: true };
}
