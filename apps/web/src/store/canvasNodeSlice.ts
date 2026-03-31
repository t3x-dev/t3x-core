import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { getTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { useSettingsStore } from '@/store/settingsStore';
import type { CanvasNodeData, EmbeddedLeaf } from '../types/nodes';
import type { CanvasState, NodeSlice } from './canvasStoreTypes';
import {
  backflowEdgeStyle,
  edgeStyle,
  edgeType,
  resolveLatestMainUnitId,
  snapPosition,
  unitToNode,
} from './canvasStoreUtils';

export const createNodeSlice: StateCreator<CanvasState, [], [], NodeSlice> = (set, get) => ({
  loadProjectData: async (projectId: string, options?: { merge?: boolean }) => {
    // Skip if already loading the same project
    const state = get();
    if (state.projectId === projectId && state.loading) {
      return;
    }

    // For merge mode (polling), don't show loading state
    if (!options?.merge) {
      set({ loading: true, loadError: null, projectId });
    } else {
      set({ projectId });
    }

    try {
      // Fetch conversations, commits, and leaves in parallel
      const [convResponse, apiCommits, projectLeaves] = await Promise.all([
        api.listConversations(projectId, 100, 0),
        api.listCommits(projectId, undefined, 100),
        api.listLeavesByProject(projectId).catch((err) => {
          console.warn('[canvasStore] Failed to load leaves:', err);
          return [] as api.Leaf[];
        }),
      ]);

      // Guard: discard results if the project changed while we were fetching
      if (get().projectId !== projectId) return;

      const conversations = convResponse.conversations;

      // Convert ApiCommit to V2-compatible format for unitToNode
      const commits: api.Commit[] = apiCommits.map(
        (v5) =>
          ({
            commit_hash: v5.hash,
            project_id: v5.project_id || projectId,
            branch: v5.branch || 'main',
            message: v5.message,
            parent_hashes: v5.parents,
            // v5: no turn_window in tree-based commits; use sources for conversation association
            turn_window: null,
            facet_snapshot: null, // tree-based commits use nodes, not facet_snapshot
            pipeline_config: null,
            draft_id: null,
            draft_text_hash: null,
            signature: null,
            source_excerpt: null, // trees don't have a flat node list for excerpts
            must_have: null,
            mustnt_have: null,
            position_x: v5.position_x ?? null,
            position_y: v5.position_y ?? null,
            // Convert v5 sources (uses "id") to V2 format (uses "conversation_id")
            source_refs:
              v5.sources?.map((ref) => ({
                type: ref.type === 'leaf' ? 'commit' : ref.type,
                conversation_id: ref.id,
              })) ?? null,
            anchors: null,
            created_at: v5.committed_at,
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

      // Build a map: commit_hash -> original ApiCommit data (for source context display)
      const nodeCommitMap = new Map<string, api.ApiCommit>();
      apiCommits.forEach((v5) => {
        nodeCommitMap.set(v5.hash, v5);
      });

      // Build maps for conversation → commits (one conversation can have multiple commits)
      const convToCommitsMap = new Map<string, api.Commit[]>();
      const commitsWithConv = new Set<string>();
      commits.forEach((commit) => {
        const convId = commitSourceConvMap.get(commit.commit_hash);
        if (convId) {
          commitsWithConv.add(commit.commit_hash);
          const list = convToCommitsMap.get(convId) || [];
          list.push(commit);
          convToCommitsMap.set(convId, list);
        }
      });

      // Create unit nodes:
      // 1. Each commit becomes its own node (so parent→child edges can connect them)
      // 2. Conversations without commits become staging nodes
      const commitedUnitNodes: Node<CanvasNodeData>[] = [];
      const stagingUnitNodes: Node<CanvasNodeData>[] = [];

      let nodeIndex = 0;

      // Create a node for each committed unit (each commit is a separate node)
      commits.forEach((commit) => {
        let convId = commitSourceConvMap.get(commit.commit_hash);

        // Method 3: If no mapping found but project has exactly one conversation,
        // assume it's the source (common case for simple single-conversation projects)
        if (!convId && conversations.length === 1) {
          convId = conversations[0].conversation_id;
        }

        const conv = convId ? conversations.find((c) => c.conversation_id === convId) : undefined;

        // Use conversation if found, otherwise create virtual one
        const displayConv: api.Conversation = conv || {
          conversation_id: `orphan-${commit.commit_hash.slice(0, 12)}`,
          project_id: projectId,
          title:
            commit.message ||
            `${getTerminology('commit', useSettingsStore.getState().developerMode)} ${commit.commit_hash.slice(0, 8)}`,
          parent_commit_hash: commit.parent_hashes[0] ?? undefined,
          turns_count: 0,
          position_x: undefined,
          position_y: undefined,
          created_at: commit.created_at,
        };

        const originalCommit = nodeCommitMap.get(commit.commit_hash);
        const node = unitToNode(displayConv, commit, nodeIndex++, originalCommit);
        const existingPos = existingNodePositions.get(node.id);
        if (existingPos) {
          node.position = existingPos;
        }
        commitedUnitNodes.push(node);
      });

      // Create staging nodes for conversations that have NO commits at all
      const convsWithCommits = new Set(Array.from(convToCommitsMap.keys()));
      conversations.forEach((conv) => {
        if (!convsWithCommits.has(conv.conversation_id)) {
          const node = unitToNode(conv, null, nodeIndex++);
          const existingPos = existingNodePositions.get(node.id);
          if (existingPos) {
            node.position = existingPos;
          }
          stagingUnitNodes.push(node);
        }
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

      // Build backflow edges: Leaf → parent Commit for leaves with assertion lessons.
      // These represent feedback flowing back from output validation to the knowledge graph.
      // Note: leaf nodes are currently embedded inside commit nodes; these edges will
      // render once leaf nodes become standalone canvas nodes in a future iteration.
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      for (const leaf of projectLeaves) {
        const hasLessons = leaf.assertions?.some((a) => a.lesson && a.lesson.trim() !== '');
        if (hasLessons && nodeIdSet.has(leaf.commit_hash)) {
          edges.push({
            id: `backflow-${leaf.id}-${leaf.commit_hash}`,
            source: leaf.id,
            target: leaf.commit_hash,
            type: 'default',
            animated: true,
            style: backflowEdgeStyle,
            data: { edgeType: 'backflow', leafId: leaf.id },
          });
        }
      }

      const commitHashes = new Set(commits.map((c) => c.commit_hash));

      // Build unit→unit edges based on commit parent relationships
      // In the unit model, edges connect committed units to their children
      // Edge: parentUnit (commit_hash) → childUnit (commit_hash)
      // Semantic type: evolve (single parent) or merge (multiple parents)
      commits.forEach((commit) => {
        const isMergeCommit = commit.parent_hashes.length > 1;
        commit.parent_hashes.forEach((parentHash) => {
          if (!commitHashes.has(parentHash)) return;

          edges.push({
            id: `unit-${parentHash}-${commit.commit_hash}`,
            source: parentHash,
            target: commit.commit_hash,
            type: edgeType,
            animated: false,
            style: edgeStyle,
            data: { edgeType: isMergeCommit ? 'merge' : 'evolve' },
          });
        });
      });

      // Build edges: staging conversation → parent commit
      // When a user "continues" from a committed node, a new STAGING conversation
      // is created with parent_commit_hash. We need to show this link on the canvas.
      for (const conv of conversations) {
        if (conv.parent_commit_hash && !convsWithCommits.has(conv.conversation_id)) {
          // This is a staging conversation that has a parent commit
          const parentExists = commitHashes.has(conv.parent_commit_hash);
          const childNodeId = conv.conversation_id;
          const childExists = nodeIdSet.has(childNodeId);
          if (parentExists && childExists) {
            edges.push({
              id: `staging-${conv.parent_commit_hash}-${childNodeId}`,
              source: conv.parent_commit_hash,
              target: childNodeId,
              type: edgeType,
              animated: true,
              style: { ...edgeStyle, strokeDasharray: '5 5' },
              data: { edgeType: 'evolve' },
            });
          }
        }
      }

      // Load editing drafts and create draft nodes + conversation→draft edges
      try {
        const editingDrafts = await api.listWorkbenchDrafts(projectId, 'editing');
        // Build conversationId → nodeId map for edge creation
        const convToNodeId = new Map<string, string>();
        for (const node of nodes) {
          if (node.data.conversationId) {
            convToNodeId.set(node.data.conversationId, node.id);
          }
        }

        const existingNodeIds = new Set(nodes.map((n) => n.id));

        for (const draft of editingDrafts) {
          // Skip if node already exists (user-created via addDraftNode)
          if (existingNodeIds.has(draft.id)) continue;

          // Compute position: centroid of source conversation nodes, offset right
          const sourceConvIds = new Set(
            draft.nodes
              .filter((s) => s.source?.conversation_id)
              .map((s) => s.source!.conversation_id)
          );
          let posX = 140 + (nodes.length % 3) * 220;
          let posY = 100 + Math.floor(nodes.length / 3) * 180;
          if (sourceConvIds.size > 0) {
            let sumX = 0;
            let sumY = 0;
            let count = 0;
            for (const convId of sourceConvIds) {
              const nodeId = convToNodeId.get(convId);
              const sourceNode = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
              if (sourceNode) {
                sumX += sourceNode.position.x;
                sumY += sourceNode.position.y;
                count++;
              }
            }
            if (count > 0) {
              posX = sumX / count + 300;
              posY = sumY / count;
            }
          }

          const existingPos = existingNodePositions.get(draft.id);
          const draftNode: Node<CanvasNodeData> = {
            id: draft.id,
            type: 'unit',
            position: existingPos ?? snapPosition({ x: posX, y: posY }),
            data: {
              entryId: draft.id.replace(/^draft_/, '').slice(0, 8),
              title: draft.title,
              summary: `${draft.nodes.length} nodes`,
              status: 'draft',
              timestamp: draft.updated_at,
              tags: ['draft'],
              kind: 'unit',
              commitStatus: 'draft',
              draftId: draft.id,
            },
          };
          nodes.push(draftNode);

          // Create edges from source conversations to draft
          for (const convId of sourceConvIds) {
            const sourceNodeId = convToNodeId.get(convId);
            if (sourceNodeId) {
              edges.push({
                id: `draft-${sourceNodeId}-${draft.id}`,
                source: sourceNodeId,
                target: draft.id,
                type: edgeType,
                animated: true,
                style: { ...edgeStyle, strokeDasharray: '5 5' },
                data: { edgeType: 'draft' },
              });
            }
          }
        }
      } catch {
        // Drafts loading is non-critical — don't fail canvas load
      }

      // Discard stale results if project changed while loading
      if (get().projectId !== projectId) return;

      // Check for main commits
      const hasMainCommit = commits.some((c) => c.branch === 'main');
      const latestMainCommitId = resolveLatestMainUnitId(nodes);

      if (options?.merge) {
        // Incremental merge: add new nodes/edges, preserve existing positions and edges
        const existing = get();
        const existingNodeIds = new Set(existing.nodes.map((n) => n.id));
        const existingEdgeIds = new Set(existing.edges.map((e) => e.id));

        // Add only new nodes (preserve existing ones with their positions)
        const newNodes = nodes.filter((n) => !existingNodeIds.has(n.id));
        // Add only new edges (never remove existing edges)
        const newEdges = edges.filter((e) => !existingEdgeIds.has(e.id));

        if (newNodes.length > 0 || newEdges.length > 0) {
          set({
            nodes: [...existing.nodes, ...newNodes],
            edges: [...existing.edges, ...newEdges],
            hasMainCommit,
            latestMainCommitId,
          });
        }
      } else {
        set({
          nodes,
          edges,
          hasMainCommit,
          latestMainCommitId,
          loading: false,
          loadError: null,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        loading: false,
        loadError: error,
      });
    }
  },

  refreshLeaves: async (projectId: string) => {
    try {
      const projectLeaves = await api.listLeavesByProject(projectId).catch(() => [] as api.Leaf[]);
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
      set((state) => ({
        nodes: state.nodes.map((node) => {
          const commitHash = node.data.commitHash;
          if (!commitHash) return node;
          const newLeaves = leavesByCommit.get(commitHash) || [];
          const oldLeaves = node.data.leaves || [];
          // Only update if the set of leaf IDs actually changed
          const oldIds = oldLeaves
            .map((l) => l.id)
            .sort()
            .join(',');
          const newIds = newLeaves
            .map((l) => l.id)
            .sort()
            .join(',');
          if (oldIds === newIds) return node;
          return { ...node, data: { ...node.data, leaves: newLeaves } };
        }),
      }));
    } catch {
      // Silent fail — not critical
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
      commitConflicts: {},
      dismissedConflicts: {},
      showConflictPanel: null,
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

  addDraftNode: async (position) => {
    const state = get();
    if (!state.projectId) {
      throw new Error('Cannot create draft: no project selected');
    }

    const total = state.nodes.length;
    const basePosition = position ?? {
      x: 140 + (total % 3) * 220,
      y: 100 + Math.floor(total / 3) * 180,
    };
    const snappedPosition = snapPosition(basePosition);

    const draft = await api.createWorkbenchDraft({
      project_id: state.projectId,
      title: 'Untitled Draft',
    });

    const newNode: Node<CanvasNodeData> = {
      id: draft.id,
      type: 'unit',
      position: snappedPosition,
      data: {
        entryId: draft.id.replace(/^draft_/, '').slice(0, 8),
        title: draft.title,
        summary: 'Draft',
        status: 'draft',
        timestamp: draft.created_at,
        tags: ['draft'],
        kind: 'unit',
        commitStatus: 'draft',
        draftId: draft.id,
      },
    };

    set((s) => ({
      nodes: [...s.nodes, newNode],
    }));
  },

  updateNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
      ),
    })),

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
});
