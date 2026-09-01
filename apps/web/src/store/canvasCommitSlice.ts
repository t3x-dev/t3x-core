import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import type { CanvasNodeData, SourceTextBlock } from '../types/nodes';
import { tokenizeText } from '../utils/tokenizer';
import type { CanvasState, CommitSlice } from './canvasStoreTypes';
import {
  canCreateStagingUnitFromUnit,
  commitQuickOffset,
  computeAttachedPosition,
  determineStagingUnitBranchMode,
  edgeStyle,
  edgeType,
  getNodeCounter,
  hasPendingUnitNode,
  isPendingUnitNode,
  nextEdgeId,
  nextNodeId,
  PENDING_UNIT_LIMIT_MESSAGE,
  resolveLatestMainUnitId,
} from './canvasStoreUtils';

/**
 * Commit slice — pure state mutation + pure getters.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (addFromConversation, addConversationFromCommit, startMerge) live in
 * `hooks/useCanvasCommitActions`. The slice exposes `appendNodeAndEdge`
 * so those hooks can atomically append a node+edge after the API resolves.
 */
export const createCommitSlice: StateCreator<CanvasState, [], [], CommitSlice> = (set, get) => ({
  addPendingCommitFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) =>
          node.id === commitId &&
          node.data.kind === 'unit' &&
          node.data.commitStatus === 'committed'
      );
      if (!source) {
        return {};
      }
      if (hasPendingUnitNode(state.nodes)) {
        state.notifyCallback?.(PENDING_UNIT_LIMIT_MESSAGE, 'warning');
        return {};
      }

      const sourceExcerptArray = source.data.sourceExcerpt || [];
      const sourceExcerptText = sourceExcerptArray.join('\n');
      const tokens = tokenizeText(sourceExcerptText);
      const pendingSourceBlock: SourceTextBlock = {
        id: 'block-unit-1',
        originalText: sourceExcerptText,
        tokens,
        selections: [],
        keywords: [],
        sourceNodeId: source.data.commitHash || source.id,
        sourceNodeType: 'unit',
        sourceNodeTitle: source.data.title || `Unit ${source.data.entryId}`,
      };

      let charOffset = 0;
      const nodes = sourceExcerptArray.map((text, idx) => {
        const node = {
          id: `s${idx + 1}`,
          text,
          start: charOffset,
          end: charOffset + text.length,
        };
        charOffset += text.length + 1;
        return node;
      });

      const inputTextHash = `sha256:${sourceExcerptText.length}-${Date.now()}`;
      const latestMainId = resolveLatestMainUnitId(state.nodes, state.latestMainCommitId);
      const pendingBranch =
        !state.hasMainCommit || (source.data.branchType === 'main' && source.id === latestMainId)
          ? 'main'
          : 'branch';

      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'unit',
        position: computeAttachedPosition(source, 'unit', commitQuickOffset),
        data: {
          entryId: `UNIT-${getNodeCounter()}`,
          title: 'Untitled Unit',
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['unit'],
          kind: 'unit',
          bridgePrompt: 'prose',
          pendingBranch,
          pendingBranchName: '',
          commitStatus: 'staging',
          baselineSummary: sourceExcerptText,
          sourceCommitHash: source.data.commitHash,
          inheritFromCommitHash: source.data.commitHash,
          sourceTurnWindow: source.data.sourceTurnWindow,
          pendingSource:
            tokens.length > 0
              ? {
                  textBlocks: [pendingSourceBlock],
                  nodes: nodes.length > 0 ? nodes : undefined,
                  inputTextHash: nodes.length > 0 ? inputTextHash : undefined,
                }
              : undefined,
        },
      };
      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
        data: { createdAt: Date.now(), edgeType: 'evolve' },
      };
      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      };
    }),

  addUnitFromUnit: (unitId) => get().addPendingCommitFromCommit(unitId),

  appendNodeAndEdge: (node, edge) =>
    set((state) => {
      if (isPendingUnitNode(node) && hasPendingUnitNode(state.nodes)) {
        state.notifyCallback?.(PENDING_UNIT_LIMIT_MESSAGE, 'warning');
        return {};
      }
      return {
        nodes: [...state.nodes, node],
        edges: [...state.edges, edge],
      };
    }),

  getPendingCommitBranchMode: (commitId) => determineStagingUnitBranchMode(get(), commitId),
  canCreatePendingCommitFromConversation: (unitId) => {
    const state = get();
    const node = state.nodes.find(
      (candidate) => candidate.id === unitId && candidate.data.kind === 'unit'
    );
    if (!node) {
      return false;
    }
    return canCreateStagingUnitFromUnit(unitId, state.nodes, state.edges, state.hasMainCommit);
  },
});
