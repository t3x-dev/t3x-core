import type { Edge, Node } from '@xyflow/react';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { create } from 'zustand';
import { getTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { getMicrocopy } from '@/lib/microcopy';
import { sound } from '@/lib/sound';
import { useSettingsStore } from '@/store/settingsStore';
import type {
  BranchType,
  CanvasNodeData,
  EmbeddedLeaf,
  SourceTextBlock,
  TurnBoundary,
} from '../types/nodes';
import { tokenizeText } from '../utils/tokenizer';
import { createLeafSlice } from './canvasLeafSlice';
import { createMergeSlice } from './canvasMergeSlice';
import type { CanvasState } from './canvasStoreTypes';
import {
  API_V1,
  buildIncomingMap,
  buildOutgoingMap,
  canConnect,
  canCreateStagingUnitFromUnit,
  collectAffectedStagingUnits,
  commitQuickOffset,
  computeAttachedPosition,
  computeUnitTone,
  conversationCommitOffset,
  determineStagingUnitBranchMode,
  edgeStyle,
  edgeType,
  getLockedNodeIds,
  getNodeCounter,
  getNumericId,
  isUpstreamOfStagingUnit,
  nextEdgeId,
  nextNodeId,
  resetCounters,
  resolveLatestMainUnitId,
  saveNodePosition,
  snapPosition,
  unitToNode,
} from './canvasStoreUtils';

export {
  selectCanExecuteMerge,
  selectIsMerging,
  selectMergeCounts,
  selectUnresolvedCount,
} from './canvasMergeSlice';
// Re-export types and selectors for backward compatibility
export type { CanvasState } from './canvasStoreTypes';

export const useCanvasStore = create<CanvasState>((...a) => {
  const [set, get] = a;
  return {
    ...createMergeSlice(...a),
    ...createLeafSlice(...a),

    nodes: [],
    edges: [],
    hasMainCommit: false,
    latestMainCommitId: undefined,
    projectId: null,
    loading: false,
    loadError: null,
    notifyCallback: null,
    openNodeId: null,
    modalViewMode: null,
    deletionConfirmation: null,

    setNotifyCallback: (cb) => set({ notifyCallback: cb }),

    openNodeModal: (nodeId, viewMode = 'commit') =>
      set({ openNodeId: nodeId, modalViewMode: viewMode }),
    closeNodeModal: () => set({ openNodeId: null, modalViewMode: null }),

    loadProjectData: async (projectId: string) => {
      // Skip if already loading the same project
      const state = get();
      if (state.projectId === projectId && state.loading) {
        return;
      }

      set({ loading: true, loadError: null, projectId });

      try {
        // Fetch conversations, V4 commits, and leaves in parallel
        const [convResponse, commitsV4, projectLeaves] = await Promise.all([
          api.listConversations(projectId, 100, 0),
          api.listCommitsV4(projectId, undefined, 100, 0),
          api.listLeavesByProject(projectId).catch((err) => {
            console.warn('[canvasStore] Failed to load leaves:', err);
            return [] as api.Leaf[];
          }),
        ]);

        const conversations = convResponse.conversations;

        // Convert V4 commits to V2-compatible format for unitToNode
        const commits: api.Commit[] = commitsV4.map(
          (v4) =>
            ({
              commit_hash: v4.hash,
              project_id: v4.project_id || projectId,
              branch: v4.branch || 'main',
              message: v4.message,
              parent_hashes: v4.parents,
              // V4: derive turn_window from sentences[].source_ref for conversation association
              turn_window: v4.content.sentences[0]?.source_ref
                ? {
                    start_turn_hash: v4.content.sentences[0].source_ref.turn_hash,
                    end_turn_hash:
                      v4.content.sentences[v4.content.sentences.length - 1]?.source_ref
                        ?.turn_hash || v4.content.sentences[0].source_ref.turn_hash,
                  }
                : null,
              facet_snapshot: null, // V4 uses sentences only, constraints in Leaves
              pipeline_config: null,
              draft_id: null,
              draft_text_hash: null,
              signature: null,
              source_excerpt: v4.content.sentences.map((s) => s.text), // Convert sentences to source_excerpt
              must_have: null, // V4 doesn't have constraints at commit level
              mustnt_have: null,
              position_x: v4.position_x ?? null,
              position_y: v4.position_y ?? null,
              // Convert V4 source_refs (uses "id") to V2 format (uses "conversation_id")
              source_refs:
                v4.source_refs?.map((ref) => ({
                  type: ref.type === 'leaf' ? 'commit' : ref.type,
                  conversation_id: ref.id,
                })) ?? null,
              anchors: null,
              created_at: v4.created_at,
              // Store original V4 data for merge compatibility
              sourceTurnWindow: v4.content.sentences[0]?.source_ref
                ? {
                    start_turn_hash: v4.content.sentences[0].source_ref.turn_hash,
                    end_turn_hash:
                      v4.content.sentences[v4.content.sentences.length - 1]?.source_ref
                        ?.turn_hash || v4.content.sentences[0].source_ref.turn_hash,
                  }
                : undefined,
            }) as api.Commit
        );

        // Preserve existing node positions
        const existingNodePositions = new Map<string, { x: number; y: number }>();
        get().nodes.forEach((node) => {
          existingNodePositions.set(node.id, node.position);
        });

        // Build turn_hash → conversation_id map
        // Optimization: Only fetch turns for commits that have turn_window
        // Instead of fetching all turns for all conversations
        const turnToConvMap = new Map<string, string>();

        // Collect unique turn hashes we need to look up (both start and end)
        // Filter out undefined, null, empty strings, and the literal string "undefined"
        const turnHashesToLookup = new Set<string>();
        commits.forEach((commit) => {
          const startHash = commit.turn_window?.start_turn_hash;
          const endHash = commit.turn_window?.end_turn_hash;
          if (startHash && typeof startHash === 'string' && startHash !== 'undefined') {
            turnHashesToLookup.add(startHash);
          }
          if (endHash && typeof endHash === 'string' && endHash !== 'undefined') {
            turnHashesToLookup.add(endHash);
          }
        });

        // If we have turns to look up, fetch them via individual turn detail API
        // This is more efficient than fetching all turns for all conversations
        if (turnHashesToLookup.size > 0) {
          await Promise.all(
            Array.from(turnHashesToLookup).map(async (turnHash) => {
              try {
                const turn = await api.getTurn(turnHash);
                turnToConvMap.set(turn.turn_hash, turn.conversation_id);
              } catch {
                // Skip if turn fetch fails
              }
            })
          );
        }

        // Build a map: commit_hash -> conversation_id (if commit was created from a conversation)
        const commitSourceConvMap = new Map<string, string>();
        commits.forEach((commit) => {
          // Method 1: Use source_refs (most reliable - explicitly stored during commit creation)
          if (commit.source_refs && commit.source_refs.length > 0) {
            const convRef = commit.source_refs.find((ref) => ref.type === 'conversation');
            // V2 format uses conversation_id, V4 format was converted in the mapping above
            if (convRef?.conversation_id) {
              commitSourceConvMap.set(commit.commit_hash, convRef.conversation_id);
              return;
            }
          }
          // Method 2: Fallback to turn_window lookup (for older commits without source_refs)
          if (commit.turn_window) {
            const startConvId = turnToConvMap.get(commit.turn_window.start_turn_hash);
            const endConvId = turnToConvMap.get(commit.turn_window.end_turn_hash);
            if (startConvId && startConvId === endConvId) {
              commitSourceConvMap.set(commit.commit_hash, startConvId);
            }
          }
        });

        // Build a map: commit_hash -> original V4 data (for source context display)
        const commitV4Map = new Map<string, api.CommitV4>();
        commitsV4.forEach((v4) => {
          commitV4Map.set(v4.hash, v4);
        });

        // Build a map: conversation_id -> commit (for pairing into units)
        const convToCommitMap = new Map<string, api.Commit>();
        commits.forEach((commit) => {
          const convId = commitSourceConvMap.get(commit.commit_hash);
          if (convId) {
            // Use the latest commit for each conversation
            const existing = convToCommitMap.get(convId);
            if (!existing || new Date(commit.created_at) > new Date(existing.created_at)) {
              convToCommitMap.set(convId, commit);
            }
          }
        });

        // Create unit nodes from conversations (paired with commits if available)
        // Units from conversations with commits (committed units)
        const commitedUnitNodes: Node<CanvasNodeData>[] = [];
        // Units from conversations without commits (staging units)
        const stagingUnitNodes: Node<CanvasNodeData>[] = [];

        let nodeIndex = 0;
        conversations.forEach((conv) => {
          const commit = convToCommitMap.get(conv.conversation_id);
          const originalV4 = commit ? commitV4Map.get(commit.commit_hash) : undefined;
          const node = unitToNode(conv, commit || null, nodeIndex++, originalV4);
          const existingPos = existingNodePositions.get(node.id);
          if (existingPos) {
            node.position = existingPos;
          }
          if (commit) {
            commitedUnitNodes.push(node);
          } else {
            stagingUnitNodes.push(node);
          }
        });

        // Orphan commits (not linked to any conversation) - create standalone units
        const orphanCommits = commits.filter((c) => !commitSourceConvMap.has(c.commit_hash));
        orphanCommits.forEach((commit) => {
          // Create a minimal "virtual" conversation for the orphan commit
          const virtualConv: api.Conversation = {
            conversation_id: `orphan-${commit.commit_hash.slice(0, 12)}`,
            project_id: projectId,
            title: commit.message || `Commit ${commit.commit_hash.slice(0, 8)}`,
            parent_commit_hash: commit.parent_hashes[0] ?? undefined,
            turns_count: 0,
            position_x: undefined,
            position_y: undefined,
            created_at: commit.created_at,
          };
          const originalV4 = commitV4Map.get(commit.commit_hash);
          const node = unitToNode(virtualConv, commit, nodeIndex++, originalV4);
          const existingPos = existingNodePositions.get(node.id);
          if (existingPos) {
            node.position = existingPos;
          }
          commitedUnitNodes.push(node);
        });

        const nodes = [...commitedUnitNodes, ...stagingUnitNodes];

        // Embed leaves into their parent commit nodes
        if (projectLeaves.length > 0) {
          const leavesByCommit = new Map<string, EmbeddedLeaf[]>();
          for (const leaf of projectLeaves) {
            const embedded: EmbeddedLeaf = {
              id: leaf.id,
              type: leaf.type,
              title: leaf.title || leaf.type,
              createdAt: leaf.created_at,
            };
            const existing = leavesByCommit.get(leaf.commit_hash) || [];
            existing.push(embedded);
            leavesByCommit.set(leaf.commit_hash, existing);
          }
          for (const node of nodes) {
            const commitHash = node.data.commitHash;
            if (commitHash && leavesByCommit.has(commitHash)) {
              node.data.leaves = leavesByCommit.get(commitHash);
            }
          }
        }

        const edges: Edge[] = [];
        const commitHashes = new Set(commits.map((c) => c.commit_hash));

        // Build unit→unit edges based on commit parent relationships
        // In the unit model, edges connect committed units to their children
        // Edge: parentUnit (commit_hash) → childUnit (commit_hash)
        commits.forEach((commit) => {
          commit.parent_hashes.forEach((parentHash) => {
            if (!commitHashes.has(parentHash)) return;

            edges.push({
              id: `unit-${parentHash}-${commit.commit_hash}`,
              source: parentHash,
              target: commit.commit_hash,
              type: edgeType,
              animated: false,
              style: edgeStyle,
            });
          });
        });

        // Check for main commits
        const hasMainCommit = commits.some((c) => c.branch === 'main');
        const latestMainCommitId = resolveLatestMainUnitId(nodes);

        set({
          nodes,
          edges,
          hasMainCommit,
          latestMainCommitId,
          loading: false,
          loadError: null,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        set({
          loading: false,
          loadError: error,
        });
      }
    },

    clearCanvas: () => {
      set({
        nodes: [],
        edges: [],
        projectId: null,
        loading: false,
        loadError: null,
        hasMainCommit: false,
        latestMainCommitId: undefined,
      });
    },

    addNode: async (kind, position) => {
      const state = get();
      const total = state.nodes.length;
      const basePosition = position ?? {
        x: 140 + (total % 3) * 220,
        y: 100 + Math.floor(total / 3) * 180,
      };
      const snappedPosition = snapPosition(basePosition);

      // For unit nodes, create a staging unit with a new conversation
      if (kind === 'unit') {
        if (!state.projectId) {
          throw new Error('Cannot create unit: no project selected');
        }

        const conversation = await api.createConversation(
          state.projectId,
          'Untitled Unit',
          undefined, // no parent commit
          { x: snappedPosition.x, y: snappedPosition.y }
        );

        const newNode: Node<CanvasNodeData> = {
          id: conversation.conversation_id,
          type: 'unit',
          position: snappedPosition,
          data: {
            entryId: conversation.conversation_id.replace(/^conv_/, '').slice(0, 8),
            title: conversation.title || 'Untitled Unit',
            summary: '0 turns',
            status: 'staging',
            timestamp: conversation.created_at,
            tags: ['unit'],
            kind: 'unit',
            conversationId: conversation.conversation_id,
            commitStatus: 'staging',
            // Set sourceConversationId to self for new units (enables commit flow)
            sourceConversationId: conversation.conversation_id,
          },
        };

        set((s) => ({
          nodes: [...s.nodes, newNode],
        }));
        return;
      }

      // For leaf nodes: must be created via LeafPanel from a commit
      // Direct creation would create a fake node without backend data
      if (kind === 'leaf') {
        // Use warning instead of error - this is an expected user flow issue, not a bug
        const notify = get().notifyCallback;
        notify?.('To create a Leaf, click "Add output" on a committed Unit node.', 'warning');
        return;
      }

      // Fallback for any unknown kinds - should not happen
      throw new Error(`Cannot create node of kind "${kind}" directly.`);
    },

    updateNode: (id, patch) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
        ),
      })),

    commitPendingCommit: (id) => {
      const state = get();
      const notify = state.notifyCallback;

      const pendingNode = state.nodes.find(
        (node) =>
          node.id === id && node.data.kind === 'unit' && node.data.commitStatus === 'staging'
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
              const dev = useSettingsStore.getState().developerMode;
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

      const mode = useSettingsStore.getState().developerMode ? 'developer' : 'default';
      notify?.(getMicrocopy('commitSuccess', mode, { hash_short: id.slice(0, 7) }), 'success');
      sound.playCommit();
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
        data: { createdAt: Date.now() },
      };

      set({
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      });
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
        },
      };
      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
        data: { createdAt: Date.now() },
      };

      set({
        nodes: [...get().nodes, newNode],
        edges: [...get().edges, newEdge],
      });
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

        // Build sentences for V3 commit compatibility
        // Each sourceExcerpt item becomes a sentence
        let charOffset = 0;
        const sentences = sourceExcerptArray.map((text, idx) => {
          const sentence = {
            id: `s${idx + 1}`,
            text,
            start: charOffset,
            end: charOffset + text.length,
          };
          charOffset += text.length + 1; // +1 for newline separator
          return sentence;
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
            sourceTurnWindow: source.data.sourceTurnWindow,
            // New: pendingSource with structured text block AND sentences for V3
            pendingSource:
              tokens.length > 0
                ? {
                    textBlocks: [pendingSourceBlock],
                    sentences: sentences.length > 0 ? sentences : undefined,
                    inputTextHash: sentences.length > 0 ? inputTextHash : undefined,
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
          data: { createdAt: Date.now() },
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
        const response = await fetch(`${API_V1}/merge/drafts`, {
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

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        if (!json.success) {
          throw new Error(json.error?.message || 'Failed to create merge draft');
        }

        // Return the draft ID for navigation
        return json.data.draftId as string;
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

    onNodesChange: (changes) =>
      set((state) => {
        if (changes.length === 0) {
          return {};
        }

        const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
        const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

        // Handle position changes - save to database (debounced)
        const positionChanges = changes.filter((c) => c.type === 'position' && c.position);
        if (positionChanges.length > 0) {
          positionChanges.forEach((change) => {
            if (change.type !== 'position' || !change.position) return;
            const node = nodeMap.get(change.id);
            if (!node) return;

            const snappedPos = snapPosition(change.position);
            // Save position to database (fire and forget, debounced internally)
            saveNodePosition(node.id, node.data.kind, snappedPos);
          });
        }

        // Separate remove changes from other changes
        const removeChanges = changes.filter((c) => c.type === 'remove');
        const otherChanges = changes.filter((c) => c.type !== 'remove');

        // Filter out locked nodes from removal
        const allowedRemoves = removeChanges.filter((c) => !lockedNodes.has(c.id));

        if (allowedRemoves.length === 0) {
          // No removes, just apply other changes
          if (otherChanges.length === 0) return {};
          return {
            nodes: (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
              (node) => ({
                ...node,
                position: snapPosition(node.position),
              })
            ),
          };
        }

        // Check if any of the nodes to be removed need confirmation
        const nodeIdsToRemove = allowedRemoves.map((c) => c.id);
        const needsConfirmation: string[] = [];
        const directDeletes: string[] = [];

        nodeIdsToRemove.forEach((nodeId) => {
          const node = nodeMap.get(nodeId);
          if (!node) return;

          // Staging unit needs confirmation
          if (node.data.kind === 'unit' && node.data.commitStatus === 'staging') {
            needsConfirmation.push(nodeId);
            return;
          }

          // Node upstream of pending commit needs confirmation
          if (isUpstreamOfStagingUnit(nodeId, state.nodes, state.edges)) {
            needsConfirmation.push(nodeId);
            return;
          }

          // Otherwise, can delete directly
          directDeletes.push(nodeId);
        });

        // If there are nodes needing confirmation, show dialog
        if (needsConfirmation.length > 0) {
          // Build confirmation message
          const stagingUnitsInSelection = needsConfirmation.filter((id) => {
            const n = nodeMap.get(id);
            return n?.data.kind === 'unit' && n?.data.commitStatus === 'staging';
          });
          const upstreamNodes = needsConfirmation.filter(
            (id) => !stagingUnitsInSelection.includes(id)
          );
          const affectedDownstream = collectAffectedStagingUnits(
            needsConfirmation,
            state.nodes,
            state.edges
          );

          let message = '';
          if (stagingUnitsInSelection.length > 0) {
            message += `Discard ${stagingUnitsInSelection.length} staging unit(s)?`;
          }
          if (upstreamNodes.length > 0) {
            if (message) message += '\n';
            message += `Delete ${upstreamNodes.length} upstream node(s)?`;
          }
          if (affectedDownstream.length > 0) {
            if (message) message += '\n';
            message += `This will also affect ${affectedDownstream.length} downstream pending commit(s).`;
          }

          // Collect edges that connect to/from nodes being deleted
          const edgesToRemove = state.edges
            .filter(
              (e) => needsConfirmation.includes(e.source) || needsConfirmation.includes(e.target)
            )
            .map((e) => e.id);

          // Apply direct deletes immediately, but defer confirmation nodes
          const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));

          // Delete conversations from database for directly deleted unit nodes
          // Note: Commit deletion is local only - backend deleteCommit API not available
          directDeletes.forEach((nodeId) => {
            const node = nodeMap.get(nodeId);
            if (node?.data.kind === 'unit' && node.data.conversationId) {
              api.deleteConversation(node.data.conversationId).catch(() => {
                // Error handled silently
              });
            }
          });

          const newNodes =
            directRemoveChanges.length > 0
              ? (
                  applyNodeChanges(
                    [...otherChanges, ...directRemoveChanges],
                    state.nodes
                  ) as Node<CanvasNodeData>[]
                ).map((node) => ({
                  ...node,
                  position: snapPosition(node.position),
                }))
              : otherChanges.length > 0
                ? (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
                    (node) => ({
                      ...node,
                      position: snapPosition(node.position),
                    })
                  )
                : state.nodes;

          return {
            nodes: newNodes,
            deletionConfirmation: {
              nodeIds: needsConfirmation,
              edgeIds: edgesToRemove,
              message,
              onConfirm: () => {
                // This will be called when user confirms
                const currentState = get();
                const nodesToDelete = new Set(needsConfirmation);
                const edgesToDelete = new Set(edgesToRemove);

                // Delete conversations from database for unit nodes
                // Note: Commit deletion is local only - backend deleteCommit API not available
                needsConfirmation.forEach((nodeId) => {
                  const node = currentState.nodes.find((n) => n.id === nodeId);
                  if (node?.data.kind === 'unit' && node.data.conversationId) {
                    api.deleteConversation(node.data.conversationId).catch(() => {
                      // Error handled silently
                    });
                  }
                });

                set((s) => ({
                  nodes: s.nodes.filter((n) => !nodesToDelete.has(n.id)),
                  edges: s.edges.filter(
                    (e) =>
                      !edgesToDelete.has(e.id) &&
                      !nodesToDelete.has(e.source) &&
                      !nodesToDelete.has(e.target)
                  ),
                  deletionConfirmation: null,
                }));
              },
            },
          };
        }

        // No confirmation needed, apply all changes
        // Delete conversations from database for removed unit nodes
        // Note: Commit deletion is local only - backend deleteCommit API not available
        allowedRemoves.forEach((change) => {
          const node = nodeMap.get(change.id);
          if (node?.data.kind === 'unit' && node.data.conversationId) {
            api.deleteConversation(node.data.conversationId).catch(() => {
              // Error handled silently
            });
          }
        });

        return {
          nodes: (
            applyNodeChanges(
              [...otherChanges, ...allowedRemoves],
              state.nodes
            ) as Node<CanvasNodeData>[]
          ).map((node) => ({
            ...node,
            position: snapPosition(node.position),
          })),
        };
      }),

    onEdgesChange: (changes) =>
      set((state) => {
        if (changes.length === 0) {
          return {};
        }

        const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
        const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

        // Separate remove changes from other changes
        const removeChanges = changes.filter((c) => c.type === 'remove');
        const otherChanges = changes.filter((c) => c.type !== 'remove');

        // Filter out edges that connect locked nodes
        // An edge is protected if BOTH source and target are locked
        // (this means the edge is part of committed history)
        const allowedRemoves = removeChanges.filter((c) => {
          const edge = state.edges.find((e) => e.id === c.id);
          if (!edge) return false;
          const sourceLocked = lockedNodes.has(edge.source);
          const targetLocked = lockedNodes.has(edge.target);
          // Block if BOTH ends are locked (edge is part of committed history)
          return !(sourceLocked && targetLocked);
        });

        if (allowedRemoves.length === 0) {
          if (otherChanges.length === 0) return {};
          return { edges: applyEdgeChanges(otherChanges, state.edges) };
        }

        // Check if any edge removal needs confirmation
        // An edge needs confirmation if it connects to a pending commit
        const needsConfirmation: string[] = [];
        const directDeletes: string[] = [];

        allowedRemoves.forEach((c) => {
          const edge = state.edges.find((e) => e.id === c.id);
          if (!edge) return;

          const targetNode = nodeMap.get(edge.target);

          // Edge going INTO a staging unit needs confirmation
          if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
            needsConfirmation.push(c.id);
            return;
          }

          // Edge from a node that feeds into pending commit downstream
          if (isUpstreamOfStagingUnit(edge.source, state.nodes, state.edges)) {
            needsConfirmation.push(c.id);
            return;
          }

          directDeletes.push(c.id);
        });

        if (needsConfirmation.length > 0) {
          // Find affected staging units
          const affectedStagingUnits = new Set<string>();
          needsConfirmation.forEach((edgeId) => {
            const edge = state.edges.find((e) => e.id === edgeId);
            if (!edge) return;

            const targetNode = nodeMap.get(edge.target);
            if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
              affectedStagingUnits.add(edge.target);
            }

            // Also check downstream
            const downstream = collectAffectedStagingUnits([edge.source], state.nodes, state.edges);
            downstream.forEach((id) => affectedStagingUnits.add(id));
          });

          const message =
            affectedStagingUnits.size > 0
              ? `This will disconnect ${affectedStagingUnits.size} staging unit(s) from their source. Continue?`
              : `Delete ${needsConfirmation.length} connection(s)?`;

          // Apply direct deletes immediately
          const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));
          const newEdges =
            directRemoveChanges.length > 0
              ? applyEdgeChanges([...otherChanges, ...directRemoveChanges], state.edges)
              : otherChanges.length > 0
                ? applyEdgeChanges(otherChanges, state.edges)
                : state.edges;

          return {
            edges: newEdges,
            deletionConfirmation: {
              nodeIds: [],
              edgeIds: needsConfirmation,
              message,
              onConfirm: () => {
                set((s) => {
                  const edgesToDelete = new Set(needsConfirmation);
                  return {
                    edges: s.edges.filter((e) => !edgesToDelete.has(e.id)),
                    deletionConfirmation: null,
                  };
                });
              },
            },
          };
        }

        // No confirmation needed
        return {
          edges: applyEdgeChanges([...otherChanges, ...allowedRemoves], state.edges),
        };
      }),

    onConnect: (connection) => {
      const { nodes, edges } = get();
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);

      if (!canConnect(source, target)) {
        return;
      }

      const exists = edges.some(
        (edge) => edge.source === connection.source && edge.target === connection.target
      );

      if (exists) {
        return;
      }

      const newEdge: Edge = {
        id: nextEdgeId(),
        source: connection.source!,
        target: connection.target!,
        type: edgeType,
        animated: false,
        style: edgeStyle,
        data: { createdAt: Date.now() },
      };

      set({ edges: [...edges, newEdge] });
    },
    getCommitTone: (commitId) => {
      const state = get();
      return computeUnitTone(state.nodes, state.edges, state.latestMainCommitId, commitId);
    },
    resetToSingleConversation: () => {
      resetCounters();
      // Don't create seed node with fake ID - user should use addNode to create real units
      set({
        nodes: [],
        edges: [],
        hasMainCommit: false,
        latestMainCommitId: undefined,
      });
    },

    // DEV: Load demo data to showcase 3-section layout
    loadDemoData: () => {
      const demoNode: Node<CanvasNodeData> = {
        id: 'demo-unit-1',
        type: 'unit',
        position: { x: 100, y: 100 },
        data: {
          entryId: 'demo_001',
          title: 'Legal rewrite v2',
          summary: 'Refined legal language for compliance review',
          status: 'Active',
          timestamp: '2h ago',
          tags: ['legal', 'compliance'],
          kind: 'unit',
          commitStatus: 'committed',
          commitHash: 'abc123def456789',
          branchType: 'main',
          // Sources section - 2 conversations
          sources: [
            {
              id: 'src-1',
              type: 'conversation',
              label: 'conv#34',
              title: 'Initial legal discussion',
            },
            { id: 'src-2', type: 'meeting', label: 'mtg#7', title: 'Compliance review meeting' },
          ],
          // Leaves section - 2 outputs
          leaves: [
            { id: 'leaf-1', type: 'tweet', title: 'Twitter Post' },
            { id: 'leaf-2', type: 'article', title: 'Blog Article' },
          ],
        },
      };

      const demoNode2: Node<CanvasNodeData> = {
        id: 'demo-unit-2',
        type: 'unit',
        position: { x: 500, y: 100 },
        data: {
          entryId: 'demo_002',
          title: 'Marketing copy draft',
          summary: '',
          status: 'Draft',
          timestamp: '1h ago',
          tags: ['marketing'],
          kind: 'unit',
          commitStatus: 'staging',
          branchType: 'branch',
          branchName: 'feature/marketing',
          mustHave: ['brand', 'value'],
          mustntHave: ['competitor'],
          // Sources - 1 file import
          sources: [
            { id: 'src-3', type: 'file', label: 'brief.pdf', title: 'Marketing brief document' },
          ],
          // No leaves yet (staging)
        },
      };

      set({
        nodes: [demoNode, demoNode2],
        edges: [],
        hasMainCommit: true,
        latestMainCommitId: 'demo-unit-1',
      });
    },

    // Save constraints to a unit node
    saveConversationConstraints: (unitId, constraints) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === unitId && node.data.kind === 'unit'
            ? { ...node, data: { ...node.data, constraints } }
            : node
        ),
      })),

    // Get constraints from a unit node
    getConversationConstraints: (unitId) => {
      const state = get();
      const node = state.nodes.find((n) => n.id === unitId && n.data.kind === 'unit');
      return node?.data.constraints;
    },

    // Update staging unit constraint overrides
    updatePendingCommitConstraintOverrides: (unitId, overrides) =>
      set((state) => ({
        nodes: state.nodes.map((node) => {
          if (
            node.id !== unitId ||
            node.data.kind !== 'unit' ||
            node.data.commitStatus !== 'staging'
          ) {
            return node;
          }
          const currentOverrides = node.data.constraintOverrides ?? {
            disabledClauseIds: [],
            additionalMustHave: [],
            additionalMustntHave: [],
            removedMustHave: [],
            removedMustntHave: [],
          };
          return {
            ...node,
            data: {
              ...node.data,
              constraintOverrides: { ...currentOverrides, ...overrides },
            },
          };
        }),
      })),

    // Get source unit for a staging unit (follows edges backward to parent unit)
    getSourceConversationForPendingCommit: (unitId) => {
      const state = get();
      const incomingMap = buildIncomingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      // BFS to find the first unit ancestor
      const visited = new Set<string>();
      const queue = [...(incomingMap.get(unitId) ?? [])];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = nodeMap.get(currentId);
        if (node?.data.kind === 'unit') {
          return node;
        }

        const parents = incomingMap.get(currentId) ?? [];
        parents.forEach((p) => {
          if (!visited.has(p)) queue.push(p);
        });
      }
      return undefined;
    },

    // Get effective constraints for a pending commit (conversation constraints + overrides)
    getPendingCommitEffectiveConstraints: (commitId) => {
      const state = get();
      const pendingNode = state.nodes.find(
        (n) => n.id === commitId && n.data.kind === 'unit' && n.data.commitStatus === 'staging'
      );
      if (!pendingNode) return undefined;

      // Find source conversation
      const sourceConv = get().getSourceConversationForPendingCommit(commitId);
      const baseConstraints = sourceConv?.data.constraints;
      if (!baseConstraints) return undefined;

      const overrides = pendingNode.data.constraintOverrides;

      // Apply overrides
      const clauses = baseConstraints.clauses.filter(
        (c) => !overrides?.disabledClauseIds?.includes(c.id)
      );

      const must_have = [
        ...baseConstraints.must_have.filter((kw) => !overrides?.removedMustHave?.includes(kw)),
        ...(overrides?.additionalMustHave ?? []),
      ];

      const mustnt_have = [
        ...baseConstraints.mustnt_have.filter((kw) => !overrides?.removedMustntHave?.includes(kw)),
        ...(overrides?.additionalMustntHave ?? []),
      ];

      return { clauses, must_have, mustnt_have };
    },

    // Check if a conversation has any downstream pending commits (for locking editing)
    hasDownstreamPendingCommits: (conversationId) => {
      const state = get();
      const outgoingMap = buildOutgoingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      // BFS to find any pending commit descendant
      const visited = new Set<string>();
      const queue = [...(outgoingMap.get(conversationId) ?? [])];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = nodeMap.get(currentId);
        if (node?.data.kind === 'unit' && node?.data.commitStatus === 'staging') {
          return true;
        }

        const children = outgoingMap.get(currentId) ?? [];
        children.forEach((c) => {
          if (!visited.has(c)) queue.push(c);
        });
      }
      return false;
    },

    // Deletion confirmation methods
    confirmDeletion: () => {
      const state = get();
      if (state.deletionConfirmation?.onConfirm) {
        state.deletionConfirmation.onConfirm();
      }
    },

    cancelDeletion: () => set({ deletionConfirmation: null }),

    // Update node ID and all related edges (for syncing local pending commit with API commit_hash)
    updateNodeId: (oldId, newId) =>
      set((state) => {
        // Update nodes
        const updatedNodes = state.nodes.map((node) =>
          node.id === oldId ? { ...node, id: newId } : node
        );

        // Update edges (both source and target references)
        const updatedEdges = state.edges.map((edge) => {
          let updated = edge;
          if (edge.source === oldId) {
            updated = { ...updated, source: newId };
          }
          if (edge.target === oldId) {
            updated = { ...updated, target: newId };
          }
          // Update edge ID if it contains the old node ID
          if (edge.id.includes(oldId)) {
            updated = { ...updated, id: edge.id.replace(oldId, newId) };
          }
          return updated;
        });

        // Update latestMainCommitId if it matches
        const latestMainCommitId =
          state.latestMainCommitId === oldId ? newId : state.latestMainCommitId;

        // Update openNodeId if the modal is open for the renamed node
        const openNodeId = state.openNodeId === oldId ? newId : state.openNodeId;

        return {
          nodes: updatedNodes,
          edges: updatedEdges,
          latestMainCommitId,
          openNodeId,
        };
      }),

    // Get direct upstream source nodes (committed units) for a staging unit
    // Returns nodes that can provide source content for a staging unit
    getUpstreamSourceNodes: (nodeId) => {
      const state = get();
      const incomingMap = buildIncomingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      const sourceNodeIds = incomingMap.get(nodeId) ?? [];
      const sourceNodes: Node<CanvasNodeData>[] = [];

      for (const sourceId of sourceNodeIds) {
        const node = nodeMap.get(sourceId);
        if (!node) continue;

        // Include committed units (not staging)
        if (node.data.kind === 'unit' && node.data.commitStatus === 'committed') {
          sourceNodes.push(node);
        }
      }

      return sourceNodes;
    },
  };
});
