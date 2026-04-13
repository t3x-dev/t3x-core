/**
 * useCanvasNodeActions — view-facing API for loading canvas data and
 * creating canvas nodes.
 *
 * Owns the I/O previously in canvasNodeSlice async methods per v2 §2.5.
 * The slice retains state + state-only setters (setProjectData,
 * mergeProjectData, setLeavesByCommit, addToNodes) which this hook
 * calls after the I/O resolves.
 */

import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
import { createWorkbenchDraft } from '@/commands/drafts';
import { getTerminology } from '@/hooks/useTerminology';
import { fetchCommits } from '@/queries/commits';
import { fetchConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { fetchTurn } from '@/queries/turns';
import { fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import { useCanvasStore } from '@/store/canvasStore';
import {
  backflowEdgeStyle,
  edgeStyle,
  edgeType,
  resolveLatestMainUnitId,
  snapPosition,
  unitToNode,
} from '@/store/canvasStoreUtils';
import { isDeveloperMode } from '@/store/shared';
import type { ApiCommit, Commit, Conversation, Leaf } from '@/types/api';
import type { CanvasNodeData, EmbeddedLeaf, NodeKind } from '../types/nodes';

interface LoadResult {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  hasMainCommit: boolean;
  latestMainCommitId: string | undefined;
  hasDbPositions: boolean;
}

/**
 * Pure composition: given fetched raw data, build canvas nodes/edges.
 * Extracted from loadProjectData so the async orchestration stays thin.
 */
function composeCanvasFromFetches(
  projectId: string,
  conversations: Conversation[],
  apiCommits: ApiCommit[],
  projectLeaves: Leaf[],
  editingDrafts: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    nodes: Array<{ source?: { conversation_id: string } | null }>;
  }>,
  turnToConvMap: Map<string, string>,
  existingNodePositions: Map<string, { x: number; y: number }>
): LoadResult {
  const commits: Commit[] = apiCommits.map(
    (v5) =>
      ({
        commit_hash: v5.hash,
        project_id: v5.project_id || projectId,
        branch: v5.branch || 'main',
        message: v5.message,
        parent_hashes: v5.parents,
        turn_window: null,
        facet_snapshot: null,
        pipeline_config: null,
        draft_id: null,
        draft_text_hash: null,
        signature: null,
        source_excerpt: null,
        must_have: null,
        mustnt_have: null,
        position_x: v5.position_x ?? null,
        position_y: v5.position_y ?? null,
        source_refs:
          v5.sources?.map((ref) => ({
            type: ref.type === 'leaf' ? 'commit' : ref.type,
            conversation_id: ref.id,
          })) ?? null,
        anchors: null,
        created_at: v5.committed_at,
      }) as Commit
  );

  // Map: commit_hash -> conversation_id
  const commitSourceConvMap = new Map<string, string>();
  commits.forEach((commit) => {
    if (commit.source_refs && commit.source_refs.length > 0) {
      const convRef = commit.source_refs.find((ref) => ref.type === 'conversation');
      if (convRef?.conversation_id) {
        commitSourceConvMap.set(commit.commit_hash, convRef.conversation_id);
        return;
      }
    }
    if (commit.turn_window) {
      const startConvId = turnToConvMap.get(commit.turn_window.start_turn_hash);
      const endConvId = turnToConvMap.get(commit.turn_window.end_turn_hash);
      if (startConvId && startConvId === endConvId) {
        commitSourceConvMap.set(commit.commit_hash, startConvId);
      }
    }
  });

  const nodeCommitMap = new Map<string, ApiCommit>();
  apiCommits.forEach((v5) => nodeCommitMap.set(v5.hash, v5));

  const convToCommitsMap = new Map<string, Commit[]>();
  commits.forEach((commit) => {
    const convId = commitSourceConvMap.get(commit.commit_hash);
    if (convId) {
      const list = convToCommitsMap.get(convId) || [];
      list.push(commit);
      convToCommitsMap.set(convId, list);
    }
  });

  const commitedUnitNodes: Node<CanvasNodeData>[] = [];
  const stagingUnitNodes: Node<CanvasNodeData>[] = [];
  let nodeIndex = 0;

  commits.forEach((commit) => {
    const convId = commitSourceConvMap.get(commit.commit_hash);
    const conv = convId ? conversations.find((c) => c.conversation_id === convId) : undefined;
    const displayConv: Conversation = conv || {
      conversation_id: `orphan-${commit.commit_hash.slice(0, 12)}`,
      project_id: projectId,
      title:
        commit.message ||
        `${getTerminology('commit', isDeveloperMode())} ${commit.commit_hash.slice(0, 8)}`,
      parent_commit_hash: commit.parent_hashes[0] ?? undefined,
      turns_count: 0,
      position_x: undefined,
      position_y: undefined,
      created_at: commit.created_at,
    };
    const originalCommit = nodeCommitMap.get(commit.commit_hash);
    const node = unitToNode(displayConv, commit, nodeIndex++, originalCommit);
    const existingPos = existingNodePositions.get(node.id);
    if (existingPos) node.position = existingPos;
    commitedUnitNodes.push(node);
  });

  const convsWithCommits = new Set(Array.from(convToCommitsMap.keys()));
  conversations.forEach((conv) => {
    if (!convsWithCommits.has(conv.conversation_id)) {
      const node = unitToNode(conv, null, nodeIndex++);
      const existingPos = existingNodePositions.get(node.id);
      if (existingPos) node.position = existingPos;
      stagingUnitNodes.push(node);
    }
  });

  const nodes = [...commitedUnitNodes, ...stagingUnitNodes];

  // Embed leaves
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
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  // Backflow edges: Leaf → parent Commit
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

  // Unit-to-unit edges from commit parents
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

  // Staging conversation → parent commit edges
  for (const conv of conversations) {
    if (conv.parent_commit_hash && !convsWithCommits.has(conv.conversation_id)) {
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

  // Editing drafts as nodes + source conversation edges
  const convToNodeId = new Map<string, string>();
  for (const node of nodes) {
    if (node.data.conversationId) {
      convToNodeId.set(node.data.conversationId, node.id);
    }
  }
  const existingNodeIds = new Set(nodes.map((n) => n.id));

  for (const draft of editingDrafts) {
    if (existingNodeIds.has(draft.id)) continue;

    const sourceConvIds = new Set(
      draft.nodes.filter((s) => s.source?.conversation_id).map((s) => s.source!.conversation_id)
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

  const hasMainCommit = commits.some((c) => c.branch === 'main');
  const latestMainCommitId = resolveLatestMainUnitId(nodes);
  const hasDbPositions =
    commits.some((c) => c.position_x != null && c.position_y != null) ||
    conversations.some((c) => c.position_x != null && c.position_y != null);

  return { nodes, edges, hasMainCommit, latestMainCommitId, hasDbPositions };
}

export function useCanvasNodeActions() {
  const load = useCallback(
    async (projectId: string, options?: { merge?: boolean }): Promise<void> => {
      const store = useCanvasStore.getState();

      // Skip if already loading the same project
      if (store.projectId === projectId && store.loading) return;

      if (!options?.merge) {
        store.setLoading(true);
        store.setLoadError(null);
      }
      // Mark projectId early so in-flight guards can detect project swaps
      useCanvasStore.setState({ projectId });

      try {
        const [convResponse, apiCommits, projectLeaves] = await Promise.all([
          fetchConversations(projectId, 100, 0),
          fetchCommits(projectId, undefined, 100),
          fetchLeavesByProject(projectId).catch((err) => {
            console.warn('[useCanvasNodeActions] Failed to load leaves:', err);
            return [] as Leaf[];
          }),
        ]);

        if (useCanvasStore.getState().projectId !== projectId) return;

        const conversations = convResponse.conversations;

        // Resolve turn → conversation for commits that have turn_window
        const turnHashesToLookup = new Set<string>();
        apiCommits.forEach((v5) => {
          // v5 commits don't carry turn_window; legacy lookup kept for safety if ever populated
          const asLegacy = v5 as unknown as {
            turn_window?: { start_turn_hash?: string; end_turn_hash?: string };
          };
          const startHash = asLegacy.turn_window?.start_turn_hash;
          const endHash = asLegacy.turn_window?.end_turn_hash;
          if (startHash && typeof startHash === 'string' && startHash !== 'undefined') {
            turnHashesToLookup.add(startHash);
          }
          if (endHash && typeof endHash === 'string' && endHash !== 'undefined') {
            turnHashesToLookup.add(endHash);
          }
        });

        const turnToConvMap = new Map<string, string>();
        if (turnHashesToLookup.size > 0) {
          await Promise.all(
            Array.from(turnHashesToLookup).map(async (turnHash) => {
              try {
                const turn = await fetchTurn(turnHash);
                turnToConvMap.set(turn.turn_hash, turn.conversation_id);
              } catch {
                // skip
              }
            })
          );
        }

        // Preserve existing positions
        const existingNodePositions = new Map<string, { x: number; y: number }>();
        useCanvasStore.getState().nodes.forEach((node) => {
          existingNodePositions.set(node.id, node.position);
        });

        // Drafts (non-critical)
        let editingDrafts: Awaited<ReturnType<typeof fetchWorkbenchDrafts>> = [];
        try {
          editingDrafts = await fetchWorkbenchDrafts(projectId, 'editing');
        } catch {
          // non-critical
        }

        if (useCanvasStore.getState().projectId !== projectId) return;

        const result = composeCanvasFromFetches(
          projectId,
          conversations,
          apiCommits,
          projectLeaves,
          editingDrafts,
          turnToConvMap,
          existingNodePositions
        );

        if (options?.merge) {
          useCanvasStore.getState().mergeProjectData(result);
        } else {
          useCanvasStore.getState().setProjectData(result);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const s = useCanvasStore.getState();
        s.setLoading(false);
        s.setLoadError(error);
      }
    },
    []
  );

  const refresh = useCallback(async (projectId: string): Promise<void> => {
    try {
      const projectLeaves = await fetchLeavesByProject(projectId).catch(() => [] as Leaf[]);
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
      useCanvasStore.getState().setLeavesByCommit(leavesByCommit);
    } catch {
      // silent
    }
  }, []);

  const add = useCallback(
    async (kind: NodeKind, position?: { x: number; y: number }): Promise<void> => {
      const store = useCanvasStore.getState();
      const total = store.nodes.length;
      const basePosition = position ?? {
        x: 140 + (total % 3) * 220,
        y: 100 + Math.floor(total / 3) * 180,
      };
      const snappedPosition = snapPosition(basePosition);

      if (kind === 'unit') {
        if (!store.projectId) {
          throw new Error('Cannot create unit: no project selected');
        }
        const conversation = await createConversation(store.projectId, 'Untitled Unit', undefined, {
          x: snappedPosition.x,
          y: snappedPosition.y,
        });
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
            sourceConversationId: conversation.conversation_id,
          },
        };
        useCanvasStore.getState().addToNodes(newNode);
        return;
      }

      if (kind === 'leaf') {
        store.notifyCallback?.(
          'To create a Leaf, click "Add output" on a committed Unit node.',
          'warning'
        );
        return;
      }

      throw new Error(`Cannot create node of kind "${kind}" directly.`);
    },
    []
  );

  const addDraft = useCallback(async (position?: { x: number; y: number }): Promise<void> => {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      throw new Error('Cannot create draft: no project selected');
    }
    const total = store.nodes.length;
    const basePosition = position ?? {
      x: 140 + (total % 3) * 220,
      y: 100 + Math.floor(total / 3) * 180,
    };
    const snappedPosition = snapPosition(basePosition);

    const draft = await createWorkbenchDraft({
      project_id: store.projectId,
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
    useCanvasStore.getState().addToNodes(newNode);
  }, []);

  return { load, refresh, add, addDraft };
}
