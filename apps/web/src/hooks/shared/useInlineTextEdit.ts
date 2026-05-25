'use client';

import type { SemanticContent, Source, SourcedYOp, TreeNode, YOp } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import { addSpanAsYOps } from '@/commands/yops/addSpanCommand';
import { SourceValidationError, YOpsReplayError } from '@/commands/yops/errors';
import { resolveHumanSource } from '@/commands/yops/goldEditBuilder';
import { replay } from '@/domain/replay';
import { buildSweepOps, findPathsOverlappingSpan, type SpanMatch } from '@/domain/spanSweep';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type InlineTextAction = 'add' | 'edit' | 'delete';

export interface InlineTextEditTarget {
  action: InlineTextAction;
  turnHash: string;
  text: string;
  start: number;
  end: number;
  replacementText?: string;
}

type PathLookup =
  | { kind: 'node'; path: string; node: TreeNode }
  | { kind: 'slot'; path: string; value: unknown };

function formatInlineEditError(err: unknown): string {
  if (err instanceof SourceValidationError) {
    return 'Cannot stage source edit: no session user or local workspace author available.';
  }
  return err instanceof Error ? err.message : String(err);
}

function resolveInlineHumanSource() {
  return resolveHumanSource('inline', {
    localAuthor: useSettingsStore.getState().localWorkspaceName,
  });
}

function withInlineSource(op: YOp | SourcedYOp, source: Source): SourcedYOp {
  const { source: _previousSource, ...body } = op as Record<string, unknown>;
  return { ...body, source } as SourcedYOp;
}

function visibleTree(state: ReturnType<typeof useWorkspaceStore.getState>): SemanticContent {
  return state.hasDraft && state.draftTree ? state.draftTree : state.tree;
}

function lookupPath(content: SemanticContent, path: string): PathLookup | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const root = content.trees.find((tree) => tree.key === parts[0]);
  if (!root) return null;
  let node: TreeNode = root;
  if (parts.length === 1) return { kind: 'node', path, node };

  for (let index = 1; index < parts.length; index++) {
    const part = parts[index];
    const child = node.children.find((candidate) => candidate.key === part);
    if (child) {
      node = child;
      if (index === parts.length - 1) return { kind: 'node', path, node };
      continue;
    }

    if (index === parts.length - 1 && Object.hasOwn(node.slots, part)) {
      return { kind: 'slot', path, value: node.slots[part] };
    }
    return null;
  }

  return null;
}

function collapseEditedText(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function replaceSelectedText(value: string, selected: string, replacement: string): string {
  const index = value.indexOf(selected);
  if (index === -1) return replacement;
  return collapseEditedText(
    `${value.slice(0, index)}${replacement}${value.slice(index + selected.length)}`
  );
}

function editSlotValue(value: unknown, selected: string, replacement: string): unknown {
  if (typeof value === 'string') return replaceSelectedText(value, selected, replacement);
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string' ? replaceSelectedText(item, selected, replacement) : item
      )
      .filter((item) => !(typeof item === 'string' && item.trim().length === 0));
  }
  return replacement;
}

function buildTextMutationOps(input: {
  action: 'edit' | 'delete';
  tree: SemanticContent;
  matches: SpanMatch[];
  selectedText: string;
  replacementText: string;
}): YOp[] {
  if (input.action === 'delete') {
    const targeted: YOp[] = [];
    for (const match of input.matches) {
      const lookedUp = lookupPath(input.tree, match.path);
      if (lookedUp?.kind === 'node') {
        targeted.push({ drop: { path: match.path } } as YOp);
        continue;
      }
      if (lookedUp?.kind !== 'slot') continue;
      const nextValue = editSlotValue(lookedUp.value, input.selectedText, '');
      if (typeof nextValue === 'string' && nextValue.trim().length === 0) {
        targeted.push({ unset: { path: match.path } } as YOp);
      } else if (Array.isArray(nextValue) && nextValue.length === 0) {
        targeted.push({ unset: { path: match.path } } as YOp);
      } else {
        targeted.push({ set: { path: match.path, value: nextValue } } as YOp);
      }
    }
    return targeted.length > 0 ? targeted : buildSweepOps(input.matches);
  }

  const ops: YOp[] = [];
  for (const match of input.matches) {
    const lookedUp = lookupPath(input.tree, match.path);
    if (lookedUp?.kind !== 'slot') continue;
    ops.push({
      set: {
        path: match.path,
        value: editSlotValue(lookedUp.value, input.selectedText, input.replacementText),
      },
    } as YOp);
  }
  return ops;
}

function stageInlineOps(ops: SourcedYOp[]): number {
  if (ops.length === 0) return 0;

  const state = useWorkspaceStore.getState();
  const baseTree = visibleTree(state);
  const replayResult = replay(ops, state.turns, baseTree);
  if (replayResult.partial) {
    throw new YOpsReplayError(
      replayResult.partial.opIndex,
      replayResult.partial.code,
      `replay failed at op ${replayResult.partial.opIndex}: ${replayResult.partial.message}`
    );
  }

  useWorkspaceStore.getState().setDraft({
    ops: [...(state.hasDraft ? state.draftOps : []), ...ops],
    tree: replayResult.tree,
  });
  return ops.length;
}

export function useInlineTextEdit() {
  const convId = useWorkspaceStore((s) => s.conversationId);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const [pending, setPending] = useState(false);

  const previewTargets = useCallback((target: Omit<InlineTextEditTarget, 'action'>) => {
    return findPathsOverlappingSpan(
      useWorkspaceStore.getState().sourceIndex,
      target.turnHash,
      target.start,
      target.end
    );
  }, []);

  const applyInlineEdit = useCallback(
    async (target: InlineTextEditTarget): Promise<number> => {
      if (!convId) throw new Error('No active conversation');
      if (useWorkspaceStore.getState().isCommitted) {
        throw new Error('Committed conversations are read-only.');
      }
      setPending(true);
      try {
        const source = await resolveInlineHumanSource();
        let ops: SourcedYOp[] = [];

        if (target.action === 'add') {
          const extracted = await addSpanAsYOps({
            conversationId: convId,
            turnHash: target.turnHash,
            text: target.replacementText?.trim() || target.text,
            start: target.start,
            end: target.end,
          });
          ops = extracted.map((op) => withInlineSource(op, source));
        } else {
          const state = useWorkspaceStore.getState();
          const matches = findPathsOverlappingSpan(
            state.sourceIndex,
            target.turnHash,
            target.start,
            target.end
          );
          if (matches.length === 0) {
            throw new Error('No mapped tree field overlaps this selection.');
          }
          ops = buildTextMutationOps({
            action: target.action,
            tree: visibleTree(state),
            matches,
            selectedText: target.text,
            replacementText: target.replacementText ?? '',
          }).map((op) => withInlineSource(op, source));
        }

        return stageInlineOps(ops);
      } catch (err) {
        const msg = formatInlineEditError(err);
        useWorkspaceStore.getState().setError(msg);
        throw new Error(msg);
      } finally {
        setPending(false);
      }
    },
    [convId]
  );

  return { applyInlineEdit, previewTargets, pending, enabled: !!convId && !isCommitted };
}
