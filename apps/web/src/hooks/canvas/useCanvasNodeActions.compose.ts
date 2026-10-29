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
import { toEmbeddedLeaf } from '@/hooks/canvas/leafEmbedding';
import { getTerminology } from '@/hooks/shared/useTerminology';
import {
  backflowEdgeStyle,
  edgeStyle,
  edgeType,
  resolveLatestMainUnitId,
  unitToNode,
} from '@/store/canvasStoreUtils';
import { isDeveloperMode } from '@/store/shared';
import type { ApiCommit, Commit, Conversation, Leaf } from '@/types/api';
import type { CanvasNodeData, CanvasPendingConversation, EmbeddedLeaf } from '@/types/nodes';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface ComposedCanvas {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  hasMainCommit: boolean;
  latestMainCommitId: string | undefined;
  hasDbPositions: boolean;
  pendingConversations: CanvasPendingConversation[];
}

function getConversationTargetBranch(
  conv: Conversation,
  commitsByHash: Map<string, ApiCommit>,
  workspaceBranchByConversation: Map<string, string>
): string | null {
  const workspaceBranch = workspaceBranchByConversation.get(conv.conversation_id);
  if (workspaceBranch) return workspaceBranch;

  const metadata = conv.metadata as
    | { target_branch?: unknown; workspace_id?: unknown }
    | null
    | undefined;
  const targetBranch = metadata?.target_branch ?? null;
  if (typeof targetBranch === 'string' && targetBranch.trim()) {
    return targetBranch.trim();
  }

  const workspaceId = metadata?.workspace_id;
  if (typeof workspaceId === 'string' && workspaceId.startsWith('workspace_branch:')) {
    const encodedBranch = workspaceId.slice('workspace_branch:'.length);
    if (encodedBranch) {
      try {
        return decodeURIComponent(encodedBranch);
      } catch {
        return encodedBranch;
      }
    }
  }

  if (!conv.parent_commit_hash) return null;
  return commitsByHash.get(conv.parent_commit_hash)?.branch ?? null;
}

function getWorkspaceBranchByConversation(workspaces: WorkspaceCandidate[]): Map<string, string> {
  const branches = new Map<string, string>();

  for (const workspace of workspaces) {
    const branch = workspace.targetBranch.trim();
    if (!branch) continue;

    for (const source of workspace.sourceBundle) {
      let conversationId = source.conversationId?.trim();
      if (!conversationId && source.type === 'chat') {
        conversationId = source.id.match(/(?:^|:)(conv_[A-Za-z0-9_-]+)$/)?.[1];
      }
      if (conversationId) branches.set(conversationId, branch);
    }
  }

  return branches;
}

export function composeCanvasFromFetches(
  projectId: string,
  conversations: Conversation[],
  apiCommits: ApiCommit[],
  projectLeaves: Leaf[],
  turnToConvMap: Map<string, string>,
  existingNodePositions: Map<string, { x: number; y: number }>,
  workspaces: WorkspaceCandidate[] = []
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

  // `committed_as` is the authoritative product-level association. CommitV2
  // intentionally does not embed a conversation id, so history projections
  // cannot be relied on to carry `sources` for this relationship.
  conversations.forEach((conversation) => {
    if (conversation.committed_as) {
      commitSourceConvMap.set(conversation.committed_as, conversation.conversation_id);
    }
  });

  const nodeCommitMap = new Map<string, ApiCommit>();
  apiCommits.forEach((v5) => nodeCommitMap.set(v5.hash, v5));
  const workspaceBranchByConversation = getWorkspaceBranchByConversation(workspaces);

  const commitedUnitNodes: Node<CanvasNodeData>[] = [];
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

  const pendingConversations = conversations
    .filter((conversation) => conversation.has_pending_changes === true)
    .map((conversation): CanvasPendingConversation => {
      const branch =
        getConversationTargetBranch(conversation, nodeCommitMap, workspaceBranchByConversation) ??
        'main';
      return {
        conversationId: conversation.conversation_id,
        title: conversation.title?.trim() || 'Untitled conversation',
        turnsCount: conversation.turns_count ?? 0,
        createdAt: conversation.created_at,
        branch,
        parentCommitHash: conversation.parent_commit_hash,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
        right.conversationId.localeCompare(left.conversationId)
    );

  const nodes = [...commitedUnitNodes];

  // Pending work is grouped by branch and rendered as one read-only terminal
  // card per branch. It remains separate from the editable staging-unit flow.
  const pendingByBranch = new Map<string, CanvasPendingConversation[]>();
  for (const conversation of pendingConversations) {
    const branchConversations = pendingByBranch.get(conversation.branch) ?? [];
    branchConversations.push(conversation);
    pendingByBranch.set(conversation.branch, branchConversations);
  }

  const latestCommitByBranch = new Map<string, Commit>();
  for (const commit of commits) {
    const current = latestCommitByBranch.get(commit.branch);
    if (
      !current ||
      new Date(commit.created_at).getTime() > new Date(current.created_at).getTime()
    ) {
      latestCommitByBranch.set(commit.branch, commit);
    }
  }

  const pendingAnchors = new Map<string, string>();
  Array.from(pendingByBranch.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([branch, branchConversations], groupIndex) => {
      const latestBranchCommit = latestCommitByBranch.get(branch);
      const explicitParent = branchConversations.find(
        (conversation) =>
          conversation.parentCommitHash && nodeCommitMap.has(conversation.parentCommitHash)
      )?.parentCommitHash;
      const anchorId = latestBranchCommit?.commit_hash ?? explicitParent;
      const anchorNode = anchorId
        ? commitedUnitNodes.find((node) => node.id === anchorId)
        : undefined;
      const branchSlug = encodeURIComponent(branch);
      const nodeId = `pending-branch:${branchSlug}`;
      const newestConversation = branchConversations[0];

      nodes.push({
        id: nodeId,
        type: 'unit',
        position: anchorNode
          ? { x: anchorNode.position.x + 400, y: anchorNode.position.y }
          : { x: 120, y: 120 + groupIndex * 200 },
        draggable: false,
        deletable: false,
        data: {
          entryId: `pending-${branchSlug}`,
          title: `${branchConversations.length} pending`,
          summary: `${branchConversations.length} conversation${branchConversations.length === 1 ? '' : 's'}`,
          status: 'pending',
          timestamp: newestConversation?.createdAt ?? new Date(0).toISOString(),
          tags: ['unit', 'pending-group'],
          kind: 'unit',
          branchType: branch === 'main' ? 'main' : 'branch',
          branchName: branch === 'main' ? undefined : branch,
          pendingBranch: branch === 'main' ? 'main' : 'branch',
          pendingBranchName: branch === 'main' ? undefined : branch,
          pendingConversationGroup: {
            branch,
            conversations: branchConversations,
          },
        },
      });

      if (anchorId) pendingAnchors.set(nodeId, anchorId);
    });

  // Embed leaves
  if (projectLeaves.length > 0) {
    const leavesByCommit = new Map<string, EmbeddedLeaf[]>();
    for (const leaf of projectLeaves) {
      const embedded = toEmbeddedLeaf(leaf);
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

  for (const [pendingNodeId, anchorId] of pendingAnchors) {
    edges.push({
      id: `pending-${anchorId}-${pendingNodeId}`,
      source: anchorId,
      target: pendingNodeId,
      type: edgeType,
      animated: false,
      style: edgeStyle,
      data: { edgeType: 'pending', edgePathTone: 'branch' },
    });
  }

  const hasMainCommit = commits.some((c) => c.branch === 'main');
  const latestMainCommitId = resolveLatestMainUnitId(nodes);
  const hasDbPositions =
    commits.some((c) => c.position_x != null && c.position_y != null) ||
    conversations.some((c) => c.position_x != null && c.position_y != null);

  return {
    nodes,
    edges,
    hasMainCommit,
    latestMainCommitId,
    hasDbPositions,
    pendingConversations,
  };
}
