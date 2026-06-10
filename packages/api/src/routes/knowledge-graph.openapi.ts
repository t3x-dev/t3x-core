/**
 * State Index Routes
 *
 * Cross-conversation state index endpoints.
 *
 * - POST   /v1/projects/:projectId/knowledge-graph/build           — Rebuild graph from committed tree content
 * - GET    /v1/projects/:projectId/knowledge-graph/nodes           — List nodes
 * - GET    /v1/projects/:projectId/knowledge-graph/nodes/:nodeId   — Node detail
 * - GET    /v1/projects/:projectId/knowledge-graph/nodes/:nodeId/neighbors — 1-hop neighbors
 * - GET    /v1/projects/:projectId/knowledge-graph/search          — Search nodes by label
 * - DELETE /v1/projects/:projectId/knowledge-graph                 — Delete graph
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: state index route normalizes dynamic DB records pending dedicated DTOs */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

import type { Commit, Relation, SlotValue, TreeNode } from '@t3x-dev/core';
import {
  type AnyDB,
  deleteKnowledgeGraphByProject,
  findKnowledgeNodeById,
  findKnowledgeNodesByProject,
  findMembersByNode,
  findNeighborNodes,
  insertKnowledgeEdges,
  insertKnowledgeNodes,
  insertNodeMembers,
  listCommits,
  searchKnowledgeNodes,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema } from '../schemas/common';

export const knowledgeGraphRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const GRAPH_BUILD_COMMIT_PAGE_SIZE = 1000;

// ── Shared Schemas ──────────────────────────────────────────

const ProjectIdParam = z.object({
  projectId: z.string().openapi({ description: 'Project ID' }),
});

const NodeIdParam = z.object({
  projectId: z.string().openapi({ description: 'Project ID' }),
  nodeId: z.string().openapi({ description: 'Knowledge node ID' }),
});

const KnowledgeNodeSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  label: z.string(),
  type: z.string(),
  summary: z.string().nullable(),
  member_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const NodeMemberSchema = z.object({
  node_id: z.string(),
  content_node_id: z.string(),
  commit_hash: z.string(),
});

const EdgeEvidenceSchema = z.object({
  source_node_key: z.string(),
  target_node_key: z.string(),
  relation_type: z.string(),
});

const KnowledgeEdgeSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  source_node_id: z.string(),
  target_node_id: z.string(),
  type: z.string(),
  weight: z.number(),
  evidence: z.array(EdgeEvidenceSchema).nullable(),
  created_at: z.string(),
});

const NeighborNodeSchema = z.object({
  node: KnowledgeNodeSchema,
  edge: KnowledgeEdgeSchema,
  direction: z.enum(['outgoing', 'incoming']),
});

// ── POST /v1/projects/:projectId/knowledge-graph/build ──────

const BuildGraphResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    commit_count: z.number(),
    nodes_created: z.number(),
    members_created: z.number(),
    edges_created: z.number(),
  }),
});

const buildRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/knowledge-graph/build',
  tags: ['State Index'],
  summary: 'Build or rebuild the state index for a project',
  description: 'Deterministically rebuilds the graph from committed tree content.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Graph rebuilt',
      content: { 'application/json': { schema: BuildGraphResponseSchema } },
    },
    500: {
      description: 'Build failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(buildRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const result = await rebuildKnowledgeGraph(db, projectId);
    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GRAPH_BUILD_FAILED', message);
  }
});

interface GraphBuildNode {
  path: string;
  label: string;
  summary: string | null;
  memberCount: number;
  members: Array<{ content_node_id: string; commit_hash: string }>;
}

interface GraphBuildEdge {
  sourcePath: string;
  targetPath: string;
  type: string;
  weight: number;
  evidence: Array<{
    source_node_key: string;
    target_node_key: string;
    relation_type: string;
  }>;
}

type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

async function rebuildKnowledgeGraph(
  db: AnyDB,
  projectId: string
): Promise<{
  commit_count: number;
  nodes_created: number;
  members_created: number;
  edges_created: number;
}> {
  const runner = db as unknown as Partial<TxRunner>;
  if (typeof runner.transaction === 'function') {
    return (await runner.transaction((tx) =>
      rebuildKnowledgeGraphInDb(tx as AnyDB, projectId)
    )) as Awaited<ReturnType<typeof rebuildKnowledgeGraphInDb>>;
  }

  return rebuildKnowledgeGraphInDb(db, projectId);
}

async function rebuildKnowledgeGraphInDb(db: AnyDB, projectId: string) {
  await deleteKnowledgeGraphByProject(db, projectId);

  const commits = await listProjectGraphCommits(db, projectId);
  const nodesByPath = new Map<string, GraphBuildNode>();
  const edgesByKey = new Map<string, GraphBuildEdge>();

  for (const commit of commits) {
    for (const tree of commit.content.trees ?? []) {
      collectGraphNodes(tree, '', commit.hash, nodesByPath);
    }

    for (const relation of commit.content.relations ?? []) {
      collectGraphEdge(relation, nodesByPath, edgesByKey);
    }
  }

  const nodeDrafts = [...nodesByPath.values()];
  const insertedNodes = await insertKnowledgeNodes(
    db,
    nodeDrafts.map((node) => ({
      project_id: projectId,
      label: node.label,
      type: 'topic',
      summary: node.summary ?? undefined,
      member_count: node.memberCount,
    }))
  );

  const nodeIdsByPath = new Map<string, string>();
  insertedNodes.forEach((node, index) => {
    const sourceNode = nodeDrafts[index];
    if (sourceNode) {
      nodeIdsByPath.set(sourceNode.path, node.id);
    }
  });

  const memberRows = nodeDrafts.flatMap((node) => {
    const nodeId = nodeIdsByPath.get(node.path);
    if (!nodeId) return [];
    return node.members.map((member) => ({
      node_id: nodeId,
      content_node_id: member.content_node_id,
      commit_hash: member.commit_hash,
    }));
  });
  await insertNodeMembers(db, memberRows);

  const insertedEdges = await insertKnowledgeEdges(
    db,
    [...edgesByKey.values()]
      .map((edge) => {
        const sourceNodeId = nodeIdsByPath.get(edge.sourcePath);
        const targetNodeId = nodeIdsByPath.get(edge.targetPath);
        if (!sourceNodeId || !targetNodeId) {
          return null;
        }
        return {
          project_id: projectId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          type: edge.type,
          weight: edge.weight,
          evidence: edge.evidence,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null)
  );

  return {
    commit_count: commits.length,
    nodes_created: insertedNodes.length,
    members_created: memberRows.length,
    edges_created: insertedEdges.length,
  };
}

export async function listProjectGraphCommits(
  db: AnyDB,
  projectId: string,
  pageSize = GRAPH_BUILD_COMMIT_PAGE_SIZE,
  fetchCommits: typeof listCommits = listCommits
): Promise<Commit[]> {
  const allCommits: Commit[] = [];
  const limit = Math.max(1, pageSize);
  let offset = 0;

  while (true) {
    const page = await fetchCommits(db, {
      projectId,
      includeSuperseded: true,
      limit,
      offset,
    });

    allCommits.push(...page);

    if (page.length < limit) {
      return allCommits;
    }

    offset += limit;
  }
}

function collectGraphNodes(
  node: TreeNode,
  parentPath: string,
  commitHash: string,
  nodesByPath: Map<string, GraphBuildNode>
) {
  const path = normalizeGraphPath(parentPath ? `${parentPath}/${node.key}` : node.key);
  if (!path) return;

  let graphNode = nodesByPath.get(path);
  if (!graphNode) {
    graphNode = {
      path,
      label: node.key,
      summary: summarizeSlots(node.slots),
      memberCount: 0,
      members: [],
    };
    nodesByPath.set(path, graphNode);
  }

  graphNode.memberCount += 1;
  graphNode.members.push({
    content_node_id: `${commitHash}:${path}`,
    commit_hash: commitHash,
  });

  for (const child of node.children ?? []) {
    collectGraphNodes(child, path, commitHash, nodesByPath);
  }
}

function collectGraphEdge(
  relation: Relation,
  nodesByPath: Map<string, GraphBuildNode>,
  edgesByKey: Map<string, GraphBuildEdge>
) {
  const sourcePath = normalizeGraphPath(relation.from);
  const targetPath = normalizeGraphPath(relation.to);
  if (!nodesByPath.has(sourcePath) || !nodesByPath.has(targetPath)) {
    return;
  }

  const key = `${sourcePath}\u0000${targetPath}\u0000${relation.type}`;
  const existing = edgesByKey.get(key);
  const evidence = {
    source_node_key: sourcePath,
    target_node_key: targetPath,
    relation_type: relation.type,
  };

  if (existing) {
    existing.weight += 1;
    existing.evidence.push(evidence);
    return;
  }

  edgesByKey.set(key, {
    sourcePath,
    targetPath,
    type: relation.type,
    weight: 1,
    evidence: [evidence],
  });
}

function normalizeGraphPath(input: string): string {
  return input.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function summarizeSlots(slots: Record<string, SlotValue>): string | null {
  const parts = Object.entries(slots)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatSlotValue(value)}`);

  if (parts.length === 0) return null;

  const summary = parts.join(', ');
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary;
}

function formatSlotValue(value: SlotValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// ── GET /v1/projects/:projectId/knowledge-graph/nodes ───────

const ListNodesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    nodes: z.array(KnowledgeNodeSchema),
    count: z.number(),
  }),
});

const listNodesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/knowledge-graph/nodes',
  tags: ['State Index'],
  summary: 'List state index nodes for a project',
  description: 'Returns nodes sorted by member_count descending.',
  request: {
    params: ProjectIdParam,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50).openapi({
        description: 'Maximum number of nodes to return',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Nodes found',
      content: { 'application/json': { schema: ListNodesResponseSchema } },
    },
    500: {
      description: 'Fetch failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(listNodesRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { limit } = c.req.valid('query');

  try {
    const db = await getDB();
    const nodes = await findKnowledgeNodesByProject(db, projectId, { limit });

    return c.json({ success: true as const, data: { nodes, count: nodes.length } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// ── GET /v1/projects/:projectId/knowledge-graph/nodes/:nodeId ──

const NodeDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    node: KnowledgeNodeSchema,
    members: z.array(NodeMemberSchema),
  }),
});

const getNodeRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/knowledge-graph/nodes/{nodeId}',
  tags: ['State Index'],
  summary: 'Get knowledge node detail with members',
  request: { params: NodeIdParam },
  responses: {
    200: {
      description: 'Node found',
      content: { 'application/json': { schema: NodeDetailResponseSchema } },
    },
    404: {
      description: 'Node not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Fetch failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(getNodeRoute, async (c) => {
  const { projectId, nodeId } = c.req.valid('param');

  try {
    const db = await getDB();
    const node = await findKnowledgeNodeById(db, nodeId);
    if (!node || node.project_id !== projectId) {
      return errorResponse(c, 'GRAPH_NODE_NOT_FOUND', `Knowledge node not found: ${nodeId}`);
    }

    const members = await findMembersByNode(db, nodeId);

    return c.json({ success: true as const, data: { node, members } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── GET /v1/projects/:projectId/knowledge-graph/nodes/:nodeId/neighbors ──

const NeighborsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    neighbors: z.array(NeighborNodeSchema),
    count: z.number(),
  }),
});

const getNeighborsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/knowledge-graph/nodes/{nodeId}/neighbors',
  tags: ['State Index'],
  summary: 'Get 1-hop neighbor nodes with edge information',
  request: { params: NodeIdParam },
  responses: {
    200: {
      description: 'Neighbors found',
      content: { 'application/json': { schema: NeighborsResponseSchema } },
    },
    404: {
      description: 'Node not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Fetch failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(getNeighborsRoute, async (c) => {
  const { projectId, nodeId } = c.req.valid('param');

  try {
    const db = await getDB();
    const node = await findKnowledgeNodeById(db, nodeId);
    if (!node || node.project_id !== projectId) {
      return errorResponse(c, 'GRAPH_NODE_NOT_FOUND', `Knowledge node not found: ${nodeId}`);
    }

    const neighbors = await findNeighborNodes(db, nodeId);

    return c.json({ success: true as const, data: { neighbors, count: neighbors.length } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── GET /v1/projects/:projectId/knowledge-graph/search ──────

const SearchNodesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    nodes: z.array(KnowledgeNodeSchema),
    count: z.number(),
  }),
});

const searchNodesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/knowledge-graph/search',
  tags: ['State Index'],
  summary: 'Search state index nodes by label',
  description: 'Case-insensitive substring search on node labels.',
  request: {
    params: ProjectIdParam,
    query: z.object({
      q: z.string().min(1).openapi({ description: 'Search query (substring match on label)' }),
      limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
        description: 'Maximum number of results',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: SearchNodesResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Search failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(searchNodesRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { q, limit } = c.req.valid('query');

  try {
    const db = await getDB();
    const nodes = await searchKnowledgeNodes(db, projectId, q, { limit });

    return c.json({ success: true as const, data: { nodes, count: nodes.length } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'SEARCH_FAILED', message);
  }
});

// ── DELETE /v1/projects/:projectId/knowledge-graph ──────────

const DeleteGraphResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    nodes_deleted: z.number(),
  }),
});

const deleteGraphRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/knowledge-graph',
  tags: ['State Index'],
  summary: 'Delete the state index for a project',
  description: 'Removes all nodes, members, and edges. Cascade delete via FK constraints.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Graph deleted',
      content: { 'application/json': { schema: DeleteGraphResponseSchema } },
    },
    500: {
      description: 'Delete failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

knowledgeGraphRoutes.openapi(deleteGraphRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const result = await deleteKnowledgeGraphByProject(db, projectId);

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});
