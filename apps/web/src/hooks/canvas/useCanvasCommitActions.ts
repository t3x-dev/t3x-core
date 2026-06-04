/**
 * useCanvasCommitActions — view-facing API for canvas commit flows that
 * cross the I/O boundary (fetchTurns, @/commands/conversations.createConversation,
 * createMergeDraft).
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions live in
 * hooks. The slice retains pure state mutation (commitPendingCommit,
 * addPendingCommitFromCommit, addUnitFromUnit) and pure getters
 * (getPendingCommitBranchMode, canCreatePendingCommitFromConversation),
 * plus a new setter `appendNodeAndEdge` that these methods call after
 * the I/O resolves.
 */

import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';
import { renameCommit as renameCommitCommand } from '@/commands/commits';
import { createConversation } from '@/commands/conversations';
import { createMergeDraft } from '@/commands/merge';
import { fetchTurns } from '@/queries/turns';
import { useCanvasStore } from '@/store/canvasStore';
import {
  canCreateStagingUnitFromUnit,
  commitQuickOffset,
  computeAttachedPosition,
  computeUnitTone,
  conversationCommitOffset,
  edgeStyle,
  edgeType,
  getNodeCounter,
  hasPendingUnitNode,
  nextEdgeId,
  nextNodeId,
  PENDING_UNIT_LIMIT_MESSAGE,
  resolveLatestMainUnitId,
} from '@/store/canvasStoreUtils';
import type { CanvasNodeData, SourceTextBlock, TurnBoundary } from '@/types/nodes';
import { tokenizeText } from '@/utils/tokenizer';

export function useCanvasCommitActions() {
  const addFromConversation = useCallback(async (conversationId: string): Promise<void> => {
    const state = useCanvasStore.getState();
    const notify = state.notifyCallback;

    const source = state.nodes.find((node) => node.id === conversationId);
    if (!source || source.data.kind !== 'unit') {
      notify?.('Unit not found', 'error');
      return;
    }
    if (hasPendingUnitNode(state.nodes)) {
      notify?.(PENDING_UNIT_LIMIT_MESSAGE, 'warning');
      return;
    }
    const canSeed = canCreateStagingUnitFromUnit(
      conversationId,
      state.nodes,
      state.edges,
      state.hasMainCommit
    );
    if (!canSeed) {
      notify?.('Cannot create pending commit from this conversation', 'warning');
      return;
    }

    let baselineSummary = '';
    let pendingSourceBlock: SourceTextBlock | undefined;
    const projectId = state.projectId;
    if (projectId && source.data.conversationId) {
      try {
        const turnsData = await fetchTurns(projectId, source.data.conversationId);
        if (turnsData.turns && turnsData.turns.length > 0) {
          const fullText = turnsData.turns.map((turn) => turn.content).join('\n');
          const tokens = tokenizeText(fullText);

          const turnBoundaries: TurnBoundary[] = [];
          let currentTokenIndex = 0;
          for (const turn of turnsData.turns) {
            const turnTokens = tokenizeText(turn.content);
            const turnTokenCount = turnTokens.length;
            if (turnTokenCount > 0) {
              turnBoundaries.push({
                role: turn.role as 'user' | 'assistant',
                startTokenIndex: currentTokenIndex,
                endTokenIndex: currentTokenIndex + turnTokenCount - 1,
              });
            }
            currentTokenIndex += turnTokenCount + 1;
          }

          pendingSourceBlock = {
            id: 'block-conv-1',
            originalText: fullText,
            tokens,
            selections: [],
            keywords: [],
            sourceNodeId: source.data.conversationId,
            sourceNodeType: 'unit',
            sourceNodeTitle: source.data.title || 'Unit',
            turnBoundaries,
          };
          baselineSummary = fullText;
        }
      } catch {
        notify?.('Failed to fetch conversation content', 'warning');
      }
    }

    const newNode: Node<CanvasNodeData> = {
      id: nextNodeId(),
      type: 'unit',
      position: computeAttachedPosition(source, 'unit', conversationCommitOffset),
      data: {
        entryId: `UNIT-${getNodeCounter()}`,
        title: 'Untitled Unit',
        summary: '',
        status: 'staging',
        timestamp: 'just now',
        tags: ['unit'],
        kind: 'unit',
        bridgePrompt: 'prose',
        pendingBranch: 'main',
        pendingBranchName: '',
        commitStatus: 'staging',
        baselineSummary,
        sourceConversationId: source.data.conversationId,
        pendingSource: pendingSourceBlock ? { textBlocks: [pendingSourceBlock] } : undefined,
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

    useCanvasStore.getState().appendNodeAndEdge(newNode, newEdge);
  }, []);

  const addConversationFromCommit = useCallback(async (commitId: string): Promise<void> => {
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!source) {
      throw new Error('Cannot create unit: source unit not found');
    }
    if (!state.projectId) {
      throw new Error('Cannot create unit: no project selected');
    }
    if (hasPendingUnitNode(state.nodes)) {
      state.notifyCallback?.(PENDING_UNIT_LIMIT_MESSAGE, 'warning');
      return;
    }

    const title = 'Untitled Unit';
    const parentCommitHash = source.data.commitHash || source.id;
    const position = computeAttachedPosition(source, 'unit', commitQuickOffset);
    const latestMainId = resolveLatestMainUnitId(state.nodes, state.latestMainCommitId);
    const pendingBranch =
      !state.hasMainCommit || (source.data.branchType === 'main' && source.id === latestMainId)
        ? 'main'
        : 'branch';
    const conversation = await createConversation(state.projectId, title, parentCommitHash, {
      x: position.x,
      y: position.y,
    });

    const newNode: Node<CanvasNodeData> = {
      id: conversation.conversation_id,
      type: 'unit',
      position,
      data: {
        entryId: conversation.conversation_id.replace(/^conv_/, '').slice(0, 8),
        title: conversation.title || title,
        summary: '0 turns',
        status: 'staging',
        timestamp: conversation.created_at,
        tags: ['unit'],
        kind: 'unit',
        conversationId: conversation.conversation_id,
        commitStatus: 'staging',
        pendingBranch,
        pendingBranchName: '',
        sourceCommitHash: parentCommitHash,
        inheritFromCommitHash: parentCommitHash,
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

    useCanvasStore.getState().appendNodeAndEdge(newNode, newEdge);
  }, []);

  const startMerge = useCallback(async (commitId: string): Promise<string | null> => {
    const state = useCanvasStore.getState();
    const nodes = state.nodes;
    const edges = state.edges;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const branchCommit = nodeMap.get(commitId);
    const notify = state.notifyCallback;

    if (
      !branchCommit ||
      branchCommit.data.kind !== 'unit' ||
      branchCommit.data.branchType !== 'branch'
    ) {
      notify?.('Cannot merge: not a branch commit', 'error');
      return null;
    }

    const sourceHash = branchCommit.data.commitHash;
    if (!sourceHash) {
      notify?.('Cannot merge: branch commit has no hash', 'error');
      return null;
    }

    const sourceBranch = branchCommit.data.branchName || 'branch';

    const latestMainId = resolveLatestMainUnitId(nodes, state.latestMainCommitId);
    if (!latestMainId) {
      notify?.('Cannot merge: no main commits found', 'error');
      return null;
    }
    const latestMainCommit = nodeMap.get(latestMainId);
    if (!latestMainCommit) {
      notify?.('Cannot merge: main commit not found', 'error');
      return null;
    }
    const targetHash = latestMainCommit.data.commitHash;
    if (!targetHash) {
      notify?.('Cannot merge: main commit has no hash', 'error');
      return null;
    }

    const tone = computeUnitTone(nodes, edges, state.latestMainCommitId, commitId);
    if (tone !== 'branch-latest') {
      notify?.('Cannot merge: only latest branch commit can be merged', 'error');
      return null;
    }

    if (!state.projectId) {
      notify?.('Cannot merge: no project selected', 'error');
      return null;
    }

    try {
      const data = await createMergeDraft({
        project_id: state.projectId,
        source_hash: sourceHash,
        target_hash: targetHash,
        source_branch: sourceBranch,
        target_branch: 'main',
      });
      return data.draftId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      notify?.(`Failed to create merge: ${errorMessage}`, 'error');
      return null;
    }
  }, []);

  /**
   * Rename a committed commit's display message. Components used to
   * dynamic-import this; the hook lifts it to a stable React surface
   * so views can call it without crossing the components -> commands
   * biome ban.
   */
  const renameCommit = useCallback(
    async (commitHash: string, newTitle: string) => renameCommitCommand(commitHash, newTitle),
    []
  );

  return { addFromConversation, addConversationFromCommit, startMerge, renameCommit };
}
