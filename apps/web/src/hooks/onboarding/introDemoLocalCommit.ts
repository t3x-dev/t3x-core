import type { SemanticContent } from '@t3x-dev/core';
import type { Edge, Node } from '@xyflow/react';
import type { ApiCommit } from '@/types/api';
import type { CanvasNodeData } from '@/types/nodes';

export const INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY = 't3x:intro-demo-local-commit';

export interface IntroDemoLocalCommit {
  projectId: string;
  conversationId: string;
  hash: string;
  branch: string;
  message: string;
  committedAt: string;
  content: SemanticContent;
}

export function saveIntroDemoLocalCommit(commit: IntroDemoLocalCommit): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY, JSON.stringify(commit));
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

export function clearIntroDemoLocalCommit(projectId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!projectId) {
      window.sessionStorage.removeItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY);
      return;
    }

    const raw = window.sessionStorage.getItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<IntroDemoLocalCommit>;
    if (parsed.projectId === projectId) {
      window.sessionStorage.removeItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY);
    }
  } catch {
    window.sessionStorage.removeItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY);
  }
}

export function readIntroDemoLocalCommit(
  projectId: string | null | undefined
): IntroDemoLocalCommit | null {
  if (typeof window === 'undefined' || !projectId) return null;
  try {
    const raw = window.sessionStorage.getItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntroDemoLocalCommit>;
    if (
      parsed.projectId !== projectId ||
      !parsed.conversationId ||
      !parsed.hash ||
      !parsed.branch ||
      !parsed.committedAt ||
      !parsed.content
    ) {
      return null;
    }
    return parsed as IntroDemoLocalCommit;
  } catch {
    return null;
  }
}

export function toIntroDemoApiCommit(commit: IntroDemoLocalCommit): ApiCommit {
  return {
    hash: commit.hash,
    schema: 't3x/commit',
    parents: [],
    author: { type: 'system', name: 'Intro demo' },
    committed_at: commit.committedAt,
    content: commit.content,
    project_id: commit.projectId,
    message: commit.message,
    branch: commit.branch,
    sources: [{ type: 'conversation', id: commit.conversationId }],
    provenance: { method: 'intro-demo-replay' },
  };
}

export function applyIntroDemoCommitToCanvasGraph({
  nodes,
  edges,
  commit,
}: {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  commit: IntroDemoLocalCommit;
}): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } | null {
  const existingCommittedNode = nodes.find(
    (node) => node.id === commit.hash || node.data.commitHash === commit.hash
  );
  const sourceNode = nodes.find(
    (node) =>
      node.data.kind === 'unit' &&
      node.data.conversationId === commit.conversationId &&
      node.data.commitStatus !== 'committed'
  );
  if (!sourceNode) return null;

  const oldId = sourceNode.id;
  const nextId = commit.hash;
  if (existingCommittedNode) {
    const updatedEdges = edges.map((edge) => {
      const nextEdge = {
        ...edge,
        source: edge.source === oldId ? existingCommittedNode.id : edge.source,
        target: edge.target === oldId ? existingCommittedNode.id : edge.target,
      };
      return nextEdge.id.includes(oldId)
        ? { ...nextEdge, id: nextEdge.id.split(oldId).join(existingCommittedNode.id) }
        : nextEdge;
    });
    return {
      nodes: nodes.filter((node) => node.id !== oldId),
      edges: updatedEdges,
    };
  }

  const branchType = commit.branch === 'main' ? 'main' : 'branch';
  const message = commit.message.trim() || sourceNode.data.title || 'Demo Commit';
  const sourceTitle = sourceNode.data.title || 'Demo conversation';

  const updatedNodes = nodes.map<Node<CanvasNodeData>>((node) => {
    if (node.id !== oldId) return node;
    return {
      ...node,
      id: nextId,
      type: 'unit',
      data: {
        ...node.data,
        entryId: nextId.slice(0, 12),
        title: message,
        summary: `${commit.content.trees.length} state tree${
          commit.content.trees.length === 1 ? '' : 's'
        }`,
        status: 'committed',
        timestamp: commit.committedAt,
        tags: Array.from(new Set([...node.data.tags, 'unit'])),
        commitStatus: 'committed',
        commitHash: nextId,
        branchType,
        branchName: branchType === 'branch' ? commit.branch : undefined,
        pendingBranch: undefined,
        pendingBranchName: undefined,
        pendingSource: undefined,
        sources: node.data.sources ?? [
          {
            id: commit.conversationId,
            type: 'conversation',
            label: `conv#${commit.conversationId.replace(/^conv_/, '').slice(0, 4)}`,
            title: sourceTitle,
          },
        ],
        commit: {
          hash: nextId,
          schema: 't3x/commit',
          author: { type: 'system', name: 'Intro demo' },
          committed_at: commit.committedAt,
          content: commit.content,
          message,
          branch: commit.branch,
          sources: [{ type: 'conversation', id: commit.conversationId, title: sourceTitle }],
          semantic: commit.content,
        },
      },
    };
  });

  const updatedEdges = edges.map((edge) => {
    const nextEdge = {
      ...edge,
      source: edge.source === oldId ? nextId : edge.source,
      target: edge.target === oldId ? nextId : edge.target,
    };
    return nextEdge.id.includes(oldId)
      ? { ...nextEdge, id: nextEdge.id.split(oldId).join(nextId) }
      : nextEdge;
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}
