'use client';

import type { HumanSource, SourcedYOp, ValidationTurn, YOp } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import { runExtraction } from '@/commands/yops/extractionWorker';
import { callExtractionLLM } from '@/commands/yops/llmAdapter';
import {
  applySourceTextDraftEdit,
  type SourceTextAction,
  type SourceTextTurnRole,
} from '@/domain/sourceTextDrafts';
import { buildSweepOps, findPathsOverlappingSpan } from '@/domain/spanSweep';
import {
  createSourceTextRevision,
  updateSourceTextRevision,
} from '@/infrastructure/sourceTextRevisions';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type InlineTextAction = SourceTextAction;

export interface SourceTextEditTarget {
  action: SourceTextAction;
  projectId?: string;
  conversationId?: string;
  turnHash: string;
  turnRole?: string;
  text: string;
  turnText?: string;
  start: number;
  end: number;
  replacementText?: string;
}

export interface SourceTextEditResult {
  revisionId: string;
  opCount: number;
  status: 'patched' | 'no_patch' | 'patch_failed';
  error?: string;
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

interface TurnRefLike {
  turn_hash?: string;
  start_char?: number;
  end_char?: number;
}

function shiftPatchOffsets(op: SourcedYOp, turnHash: string, startOffset: number): SourcedYOp {
  const source = (op as { source?: { turn_ref?: TurnRefLike } }).source;
  const ref = source?.turn_ref;
  if (!ref || ref.turn_hash !== turnHash) return op;
  if (typeof ref.start_char === 'number') ref.start_char += startOffset;
  if (typeof ref.end_char === 'number') ref.end_char += startOffset;
  return op;
}

function inlineSource(): HumanSource {
  const author = useSettingsStore.getState().localWorkspaceName.trim() || 'Local Workspace';
  return {
    type: 'human',
    author,
    at: new Date().toISOString(),
    surface: 'inline',
  };
}

function sourceOps(ops: readonly YOp[], source: HumanSource): SourcedYOp[] {
  return ops.map((op) => ({ ...(op as Record<string, unknown>), source }) as SourcedYOp);
}

function stageSourceEditOps(
  store: ReturnType<typeof useWorkspaceStore.getState>,
  ops: SourcedYOp[]
) {
  const previewResult = applySourcedYOps(store.tree, ops);
  if (!previewResult.ok) {
    throw new Error(previewResult.error?.message ?? 'Generated YOps could not be previewed');
  }
  useWorkspaceStore.getState().setDraft({
    ops,
    tree: {
      trees: previewResult.trees,
      relations: previewResult.relations,
    },
  });
}

export function useSourceTextDraft() {
  const [pending, setPending] = useState(false);

  const applySourceTextEdit = useCallback(
    async (target: SourceTextEditTarget): Promise<SourceTextEditResult> => {
      setPending(true);
      try {
        const store = useWorkspaceStore.getState();
        const turn = store.turns.find((candidate) => candidate.turn_hash === target.turnHash);
        const projectId =
          target.projectId ??
          turn?.project_id ??
          useChatStore.getState().activeProjectId ??
          store.activeProjectId;
        const conversationId =
          target.conversationId ??
          turn?.conversation_id ??
          store.conversationId ??
          useChatStore.getState().activeConversationId;
        if (!projectId || !conversationId) {
          throw new Error('Cannot edit source text: conversation context is not loaded.');
        }

        const existingDraft = store.sourceTextDrafts[target.turnHash] ?? null;
        const revisionBaseContent = existingDraft?.content ?? turn?.content ?? target.turnText;
        if (!revisionBaseContent) {
          throw new Error('Cannot edit source text: source turn is not loaded.');
        }

        const turnRole = turn?.role ?? normalizeTurnRole(target.turnRole);
        if (turnRole === 'user') {
          throw new Error('Cannot edit source text: user questions are not editable.');
        }
        const draft = applySourceTextDraftEdit({
          baseContent: revisionBaseContent,
          existingDraft,
          input: {
            turnHash: target.turnHash,
            turnRole,
            action: target.action,
            start: target.start,
            end: target.end,
            selectedText: target.text,
            replacementText: target.replacementText,
          },
        });

        const revision = await createSourceTextRevision({
          projectId,
          conversationId,
          turnHash: target.turnHash,
          turnRole,
          action: target.action,
          startChar: target.start,
          endChar: target.end,
          selectedText: target.text,
          replacementText: target.action === 'delete' ? '' : (target.replacementText ?? ''),
          baseContent: revisionBaseContent,
          content: draft.content,
          spans: draft.spans,
        });

        const savedDraft = {
          ...draft,
          revisionId: revision.revision_id,
          status: revision.status,
          baseContentHash: revision.base_content_hash,
        };
        useWorkspaceStore.getState().setSourceTextDraft(target.turnHash, savedDraft);

        const patchSpan = savedDraft.spans[savedDraft.spans.length - 1];
        const patchText = patchSpan?.text ?? '';
        if (target.action === 'delete') {
          const matches = findPathsOverlappingSpan(
            store.sourceIndex,
            target.turnHash,
            target.start,
            target.end,
            store.turns
          );
          const ops = sourceOps(buildSweepOps(matches), inlineSource());
          if (ops.length === 0) {
            await updateSourceTextRevision(revision.revision_id, {
              status: 'no_patch',
              patchOps: [],
              patchError: null,
            });
            return { revisionId: revision.revision_id, opCount: 0, status: 'no_patch' };
          }
          try {
            stageSourceEditOps(store, ops);
            await updateSourceTextRevision(revision.revision_id, {
              status: 'patched',
              patchOps: ops,
              patchError: null,
            });
            return { revisionId: revision.revision_id, opCount: ops.length, status: 'patched' };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Incremental YOps generation failed';
            await updateSourceTextRevision(revision.revision_id, {
              status: 'patch_failed',
              patchOps: null,
              patchError: message,
            }).catch(() => undefined);
            return {
              revisionId: revision.revision_id,
              opCount: 0,
              status: 'patch_failed',
              error: message,
            };
          }
        }

        if (!patchSpan || patchText.trim().length === 0) {
          await updateSourceTextRevision(revision.revision_id, {
            status: 'no_patch',
            patchOps: [],
            patchError: null,
          });
          return { revisionId: revision.revision_id, opCount: 0, status: 'no_patch' };
        }

        try {
          const extractionTurns: ValidationTurn[] = [
            {
              turn_hash: target.turnHash,
              content: patchText,
            },
          ];
          const result = await runExtraction({
            baseTree: store.tree,
            conversationId,
            turns: extractionTurns,
            commit: false,
            llm: (input) =>
              callExtractionLLM({
                conversationId,
                turns: input.turns,
              }),
          });
          const ops = result.ops.map((op) =>
            shiftPatchOffsets(op, target.turnHash, patchSpan.start)
          );
          if (ops.length === 0) {
            await updateSourceTextRevision(revision.revision_id, {
              status: 'no_patch',
              patchOps: [],
              patchError: null,
            });
            return { revisionId: revision.revision_id, opCount: 0, status: 'no_patch' };
          }
          stageSourceEditOps(store, ops);
          await updateSourceTextRevision(revision.revision_id, {
            status: 'patched',
            patchOps: ops,
            patchError: null,
          });
          return {
            revisionId: revision.revision_id,
            opCount: ops.length,
            status: 'patched',
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Incremental YOps generation failed';
          await updateSourceTextRevision(revision.revision_id, {
            status: 'patch_failed',
            patchOps: null,
            patchError: message,
          }).catch(() => undefined);
          return {
            revisionId: revision.revision_id,
            opCount: 0,
            status: 'patch_failed',
            error: message,
          };
        }
      } finally {
        setPending(false);
      }
    },
    []
  );

  return { applySourceTextEdit, pending, enabled: true };
}
