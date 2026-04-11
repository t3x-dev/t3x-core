import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { getTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { API_V1, fetchWithTimeout, handleResponse } from '@/lib/api/core';
import { getMicrocopy } from '@/lib/microcopy';
import { isDeveloperMode } from '@/store/shared';
import type { BranchType, CanvasNodeData, SourceTextBlock, TurnBoundary } from '../types/nodes';
import { tokenizeText } from '../utils/tokenizer';
import type { CanvasState, CommitSlice } from './canvasStoreTypes';
import {
  canCreateStagingUnitFromUnit,
  commitQuickOffset,
  computeAttachedPosition,
  computeUnitTone,
  conversationCommitOffset,
  determineStagingUnitBranchMode,
  edgeStyle,
  edgeType,
  getNodeCounter,
  getNumericId,
  nextEdgeId,
  nextNodeId,
  resolveLatestMainUnitId,
} from './canvasStoreUtils';

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

  addPendingCommitFromConversation: async (conversationId) => {
    const state = get();
    const notify = state.notifyCallback;

    const source = state.nodes.find((node) => node.id === conversationId);
    if (!source || source.data.kind !== 'unit') {
      notify?.('Unit not found', 'error');
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

    // Fetch actual chat content from upstream conversation
    let baselineSummary = '';
    let pendingSourceBlock: SourceTextBlock | undefined;
    const projectId = state.projectId;
    if (projectId && source.data.conversationId) {
      try {
        const turnsData = await api.listTurns(projectId, source.data.conversationId);
        if (turnsData.turns && turnsData.turns.length > 0) {
          // Build full text with turn separator (newline between turns)
          const fullText = turnsData.turns.map((turn) => turn.content).join('\n');

          // Tokenize the full text
          const tokens = tokenizeText(fullText);

          // Build turn boundaries by tracking token positions
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

            // Account for the newline separator token between turns (+1)
            // But not after the last turn
            currentTokenIndex += turnTokenCount + 1;
          }

          // Create the SourceTextBlock with source info and turn boundaries
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

          // Also keep baselineSummary for backward compatibility
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
        // Default to 'main' - user can change, commit will validate
        pendingBranch: 'main',
        pendingBranchName: '',
        commitStatus: 'staging',
        // Pass upstream chat content to pending commit
        baselineSummary,
        sourceConversationId: source.data.conversationId,
        // New: pendingSource with structured text blocks
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

    set((s) => ({
      nodes: [...s.nodes, newNode],
      edges: [...s.edges, newEdge],
    }));
  },

  addConversationFromCommit: async (commitId) => {
    const state = get();
    const source = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!source) {
      throw new Error('Cannot create unit: source unit not found');
    }
    if (!state.projectId) {
      throw new Error('Cannot create unit: no project selected');
    }

    // Create conversation via API with parent_commit_hash
    const title = 'Untitled Unit';
    const parentCommitHash = source.data.commitHash || source.id;
    // Calculate position before API call so we can save it
    const position = computeAttachedPosition(source, 'unit', commitQuickOffset);
    const conversation = await api.createConversation(state.projectId, title, parentCommitHash, {
      x: position.x,
      y: position.y,
    });

    // Add node using the real conversation ID from API
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
        conversationId: conversation.conversation_id, // Full ID for API calls
        commitStatus: 'staging',
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

    set((s) => ({
      nodes: [...s.nodes, newNode],
      edges: [...s.edges, newEdge],
    }));
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

      // Build pending source block from commit's sourceExcerpt (semantic selections)
      // Not from summary which is the generated output
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
        // No turnBoundaries for unit type
      };

      // Build nodes for V3 commit compatibility
      // Each sourceExcerpt item becomes a node
      let charOffset = 0;
      const nodes = sourceExcerptArray.map((text, idx) => {
        const node = {
          id: `s${idx + 1}`,
          text,
          start: charOffset,
          end: charOffset + text.length,
        };
        charOffset += text.length + 1; // +1 for newline separator
        return node;
      });

      // Compute inputTextHash for anchor tracking
      const inputTextHash = `sha256:${sourceExcerptText.length}-${Date.now()}`;

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
          // Default to 'main' - user can change, commit will validate
          pendingBranch: 'main',
          pendingBranchName: '',
          commitStatus: 'staging',
          // Pass upstream content to pending commit (use sourceExcerpt)
          baselineSummary: sourceExcerptText,
          // Inherit source commit info for creating child commits without conversation
          sourceCommitHash: source.data.commitHash,
          // Inherit parent commit trees into extraction panel on mount
          inheritFromCommitHash: source.data.commitHash,
          sourceTurnWindow: source.data.sourceTurnWindow,
          // New: pendingSource with structured text block AND nodes for V3
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

  // Alias for addPendingCommitFromCommit for unit model
  addUnitFromUnit: (unitId) => get().addPendingCommitFromCommit(unitId),

  /**
   * Trigger two-way merge from a branch commit to latest main
   * Opens MergePanel with prepared merge results
   */
  createMergePendingCommit: async (commitId) => {
    const state = get();
    const nodes = state.nodes;
    const edges = state.edges;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const branchCommit = nodeMap.get(commitId);

    // Validate: must be a branch commit
    if (
      !branchCommit ||
      branchCommit.data.kind !== 'unit' ||
      branchCommit.data.branchType !== 'branch'
    ) {
      state.notifyCallback?.('Cannot merge: not a branch commit', 'error');
      return null;
    }

    // Get source commit hash (branch commit)
    const sourceHash = branchCommit.data.commitHash;
    if (!sourceHash) {
      state.notifyCallback?.('Cannot merge: branch commit has no hash', 'error');
      return null;
    }

    // Get source branch name
    const sourceBranch = branchCommit.data.branchName || 'branch';

    // Get target commit hash (latest main)
    const latestMainId = resolveLatestMainUnitId(nodes, state.latestMainCommitId);
    if (!latestMainId) {
      state.notifyCallback?.('Cannot merge: no main commits found', 'error');
      return null;
    }
    const latestMainCommit = nodeMap.get(latestMainId);
    if (!latestMainCommit) {
      state.notifyCallback?.('Cannot merge: main commit not found', 'error');
      return null;
    }
    const targetHash = latestMainCommit.data.commitHash;
    if (!targetHash) {
      state.notifyCallback?.('Cannot merge: main commit has no hash', 'error');
      return null;
    }

    // Check tone - only branch-latest can merge
    const tone = computeUnitTone(nodes, edges, state.latestMainCommitId, commitId);
    if (tone !== 'branch-latest') {
      state.notifyCallback?.('Cannot merge: only latest branch commit can be merged', 'error');
      return null;
    }

    // Create merge draft via API (redirects to Merge Workspace)
    try {
      const response = await fetchWithTimeout(`${API_V1}/merge/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          source_hash: sourceHash,
          target_hash: targetHash,
          source_branch: sourceBranch,
          target_branch: 'main',
        }),
      });

      const data = await handleResponse<{ draftId: string }>(response);

      // Return the draft ID for navigation
      return data.draftId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      state.notifyCallback?.(`Failed to create merge: ${errorMessage}`, 'error');
      return null;
    }
  },

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
