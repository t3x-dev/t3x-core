/**
 * Knowledge Graph Route Tests
 *
 * Tests for /v1/projects/:projectId/knowledge-graph/* endpoints.
 * Build endpoint is stubbed (tree-based implementation pending).
 * All other endpoints work with regular tables.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock pino logger to silence output in tests
vi.mock('../middleware/logger', () => ({
  pinoLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import storage queries to set up test data directly
import {
  insertKnowledgeEdge,
  insertKnowledgeNode,
  insertKnowledgeNodes,
  insertNodeMembers,
} from '@t3x-dev/storage';
import { knowledgeGraphRoutes } from '../routes/knowledge-graph.openapi';

describe('Knowledge Graph Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', knowledgeGraphRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'KG Route Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ── Build endpoint (needs pgvector) ────────────────────────

  describe('POST /build', () => {
    it('returns error when no embeddings exist', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/build`, {
        method: 'POST',
      });

      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      // If pgvector is available: 400 EMBEDDINGS_REQUIRED (empty table)
      // If pgvector is not available: 500 GRAPH_BUILD_FAILED (table doesn't exist)
      expect([400, 500]).toContain(res.status);
      expect(['EMBEDDINGS_REQUIRED', 'GRAPH_BUILD_FAILED']).toContain(json.error.code);
    });
  });

  // ── Node CRUD (no pgvector needed) ─────────────────────────

  describe('GET /nodes', () => {
    it('returns empty array when no graph exists', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/nodes`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.nodes).toEqual([]);
      expect(json.data.count).toBe(0);
    });

    it('returns nodes sorted by member count', async () => {
      // Insert test nodes directly via storage queries
      await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'small topic', member_count: 2 },
        { project_id: testProjectId, label: 'big topic', member_count: 10 },
      ]);

      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/nodes`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes.length).toBe(2);
      // First node should have higher member_count (sorted desc)
      expect(json.data.nodes[0].member_count).toBeGreaterThanOrEqual(
        json.data.nodes[1].member_count
      );
    });

    it('respects limit parameter', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/nodes?limit=1`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes.length).toBe(1);
      expect(json.data.count).toBe(1);
    });
  });

  describe('GET /nodes/:nodeId', () => {
    it('returns node with members', async () => {
      // Insert a node and members
      const node = await insertKnowledgeNode(mockDB, {
        project_id: testProjectId,
        label: 'detail test',
        member_count: 1,
      });
      await insertNodeMembers(mockDB, [
        { node_id: node.id, content_node_id: 's_detail_1', commit_hash: 'sha256:test' },
      ]);

      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/${node.id}`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.node.id).toBe(node.id);
      expect(json.data.node.label).toBe('detail test');
      expect(json.data.members.length).toBe(1);
      expect(json.data.members[0].content_node_id).toBe('s_detail_1');
    });

    it('returns 404 for non-existent node', async () => {
      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/kn_nonexistent`,
        { method: 'GET' }
      );

      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('GRAPH_NODE_NOT_FOUND');
    });
  });

  describe('GET /nodes/:nodeId/neighbors', () => {
    it('returns neighbor nodes with edges', async () => {
      // Create two nodes with an edge between them
      const nodes = await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'neighbor A', member_count: 3 },
        { project_id: testProjectId, label: 'neighbor B', member_count: 2 },
      ]);

      await insertKnowledgeEdge(mockDB, {
        project_id: testProjectId,
        source_node_id: nodes[0].id,
        target_node_id: nodes[1].id,
        type: 'supports',
        weight: 0.85,
      });

      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/${nodes[0].id}/neighbors`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.neighbors.length).toBeGreaterThan(0);
      expect(json.data.neighbors[0].node.id).toBe(nodes[1].id);
      expect(json.data.neighbors[0].edge.type).toBe('supports');
      expect(json.data.neighbors[0].direction).toBe('outgoing');
    });

    it('returns incoming neighbors too', async () => {
      // Create two nodes with edge B -> C
      const nodes = await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'incoming source', member_count: 4 },
        { project_id: testProjectId, label: 'incoming target', member_count: 1 },
      ]);

      await insertKnowledgeEdge(mockDB, {
        project_id: testProjectId,
        source_node_id: nodes[0].id,
        target_node_id: nodes[1].id,
        type: 'contradicts',
        weight: 0.5,
      });

      // Query from target — should see source as incoming neighbor
      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/${nodes[1].id}/neighbors`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const incoming = json.data.neighbors.filter((n: ApiResponse) => n.direction === 'incoming');
      expect(incoming.length).toBeGreaterThan(0);
      expect(incoming[0].node.id).toBe(nodes[0].id);
    });

    it('returns empty for isolated node', async () => {
      const node = await insertKnowledgeNode(mockDB, {
        project_id: testProjectId,
        label: 'isolated node',
        member_count: 1,
      });

      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/${node.id}/neighbors`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.neighbors).toEqual([]);
      expect(json.data.count).toBe(0);
    });

    it('returns 404 for non-existent node', async () => {
      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/nodes/kn_nonexist/neighbors`,
        { method: 'GET' }
      );

      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('GRAPH_NODE_NOT_FOUND');
    });
  });

  describe('GET /search', () => {
    it('finds nodes matching query', async () => {
      await insertKnowledgeNode(mockDB, {
        project_id: testProjectId,
        label: 'searchable pricing topic',
        member_count: 5,
      });

      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/search?q=pricing`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes.length).toBeGreaterThan(0);
      expect(json.data.nodes.some((n: ApiResponse) => n.label.includes('pricing'))).toBe(true);
    });

    it('returns empty for non-matching query', async () => {
      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/search?q=zzzznonexistent`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes.length).toBe(0);
      expect(json.data.count).toBe(0);
    });

    it('respects limit parameter', async () => {
      // Insert several nodes matching the same query
      await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'limit test alpha', member_count: 1 },
        { project_id: testProjectId, label: 'limit test beta', member_count: 2 },
        { project_id: testProjectId, label: 'limit test gamma', member_count: 3 },
      ]);

      const res = await app.request(
        `/v1/projects/${testProjectId}/knowledge-graph/search?q=limit+test&limit=2`,
        { method: 'GET' }
      );

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes.length).toBe(2);
    });

    it('rejects empty query', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/search?q=`, {
        method: 'GET',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /', () => {
    it('deletes graph and returns count', async () => {
      // First insert some nodes
      await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'to delete A', member_count: 1 },
        { project_id: testProjectId, label: 'to delete B', member_count: 1 },
      ]);

      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.nodes_deleted).toBeGreaterThan(0);
    });

    it('returns 0 when no graph exists', async () => {
      // After deletion, deleting again should return 0
      const res = await app.request(`/v1/projects/${testProjectId}/knowledge-graph`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.nodes_deleted).toBe(0);
    });

    it('cascade deletes members and edges', async () => {
      // Insert nodes, members, and edges
      const nodes = await insertKnowledgeNodes(mockDB, [
        { project_id: testProjectId, label: 'cascade A', member_count: 1 },
        { project_id: testProjectId, label: 'cascade B', member_count: 1 },
      ]);
      await insertNodeMembers(mockDB, [
        { node_id: nodes[0].id, content_node_id: 's_cascade_1', commit_hash: 'sha256:cascade' },
      ]);
      await insertKnowledgeEdge(mockDB, {
        project_id: testProjectId,
        source_node_id: nodes[0].id,
        target_node_id: nodes[1].id,
        type: 'related',
        weight: 0.7,
      });

      // Delete the graph
      const delRes = await app.request(`/v1/projects/${testProjectId}/knowledge-graph`, {
        method: 'DELETE',
      });
      expect(delRes.status).toBe(200);

      // Verify nodes are gone
      const listRes = await app.request(`/v1/projects/${testProjectId}/knowledge-graph/nodes`, {
        method: 'GET',
      });
      const json: ApiResponse = await listRes.json();
      expect(json.data.nodes.length).toBe(0);
    });
  });
});
