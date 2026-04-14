/**
 * Canvas composition helper — pure-ish function that turns the raw
 * server payloads into the xyflow Node[]/Edge[] shape used by the
 * canvas view.
 *
 * Extracted from useCanvasNodeActions (PR24) to keep the hook file
 * under the 400-line mega-hook threshold. The function is synchronous
 * and side-effect-free modulo two zustand reads at call time
 * (`getTerminology`, `isDeveloperMode`) which are stable enough for
 * render-time invocation.
 *
 * Lives in `hooks/` (not `domain/`) because the return type references
 * `@xyflow/react` which is a React-coupled dependency; biome bans
 * domain/** from touching React-adjacent packages.
 */

import type { Edge, Node } from '@xyflow/react';
import { getTerminology } from '@/hooks/useTerminology';
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
import type { CanvasNodeData, EmbeddedLeaf } from '@/types/nodes';

export interface ComposedCanvas {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  hasMainCommit: boolean;
  latestMainCommitId: string | undefined;
  hasDbPositions: boolean;
}

export function composeCanvasFromFetches(
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
): ComposedCanvas {
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
