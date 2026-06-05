import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { getTerminology } from '@/hooks/shared/useTerminology';
import { isDeveloperMode } from '@/store/shared';
import { getMicrocopy } from '@/utils/microcopy';
import type { BranchType, CanvasNodeData, SourceTextBlock } from '../types/nodes';
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
  getNumericId,
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
  commitPendingCommit: (id) => {
    const state = get();
    const notify = state.notifyCallback;

    const pendingNode = state.nodes.find(
      (node) => node.id === id && node.data.kind === 'unit' && node.data.commitStatus === 'staging'
    );
    if (!pendingNode) {
      notify?.('Pending commit not found', 'error');
      return;
    }

    const branchMode = determineStagingUnitBranchMode(state, id);
    if (branchMode === 'blocked') {
      notify?.('Cannot commit: blocked by existing commits', 'warning');
      return;
    }

    set((state) => {
      const isMergeCommit =
        pendingNode.data.bridgePrompt === '/merge' && !!pendingNode.data.mergeConfig;
      let branchType: BranchType = 'branch';

      if (branchMode === 'force-main' || isMergeCommit) {
        branchType = 'main';
      } else if (branchMode === 'select') {
        branchType = pendingNode.data.pendingBranch ?? 'branch';
      }

      const branchName =
        branchType === 'branch'
          ? pendingNode.data.pendingBranchName?.trim() || `branch-${getNumericId(id)}`
          : undefined;

      const latestMainId = resolveLatestMainUnitId(state.nodes, state.latestMainCommitId);

      const updatedNodes = state.nodes.map<Node<CanvasNodeData>>((node) => {
        if (node.id !== id || node.data.commitStatus !== 'staging') {
          return node;
        }
        const nextData: CanvasNodeData = {
          ...node.data,
          kind: 'unit',
          entryId: `UNIT-${getNumericId(id)}`,
          status: (() => {
            const dev = isDeveloperMode();
            return `${getTerminology('committed', dev)} · awaiting ${getTerminology('diff', dev).toLowerCase()}`;
          })(),
          tags: Array.from(
            new Set([...node.data.tags, 'unit', ...(isMergeCommit ? ['merge'] : [])])
          ),
          branchType,
          branchName,
          pendingBranch: undefined,
          pendingBranchName: undefined,
          mergeConfig: undefined,
          isMergeCommit: isMergeCommit,
          commitStatus: 'committed',
        };

        return {
          ...node,
          type: 'unit',
          data: nextData,
        };
      });

      return {
        nodes: updatedNodes,
        hasMainCommit: state.hasMainCommit || branchType === 'main',
        latestMainCommitId: branchType === 'main' ? id : latestMainId,
      };
    });

    const mode = isDeveloperMode() ? 'developer' : 'default';
    notify?.(getMicrocopy('commitSuccess', mode, { hash_short: id.slice(0, 7) }), 'success');
  },

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
