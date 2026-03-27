import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteKnowledgeGraphByProject,
  findEdgesByNode,
  findKnowledgeNodeById,
  findKnowledgeNodesByProject,
  findMembersByNode,
  findNeighborNodes,
  findNodeBySentence,
  insertKnowledgeEdge,
  insertKnowledgeEdges,
  insertKnowledgeNode,
  insertKnowledgeNodes,
  insertNodeMembers,
  searchKnowledgeNodes,
} from '../queries/knowledge-graph';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Knowledge Graph Queries', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'KG Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // Node CRUD
  // =========================================================================
  describe('node CRUD', () => {
    it('inserts a node and returns output', async () => {
      const node = await insertKnowledgeNode(db, {
        project_id: projectId,
        label: 'Machine Learning',
        type: 'topic',
        summary: 'All about ML',
        member_count: 5,
      });

      expect(node).toBeDefined();
      expect(node.id).toMatch(/^kn_/);
      expect(node.project_id).toBe(projectId);
      expect(node.label).toBe('Machine Learning');
      expect(node.type).toBe('topic');
      expect(node.summary).toBe('All about ML');
      expect(node.member_count).toBe(5);
      expect(node.created_at).toBeTruthy();
      expect(node.updated_at).toBeTruthy();
    });

    it('batch inserts multiple nodes', async () => {
      const nodes = await insertKnowledgeNodes(db, [
        { project_id: projectId, label: 'Node A', member_count: 3 },
        { project_id: projectId, label: 'Node B', type: 'entity', member_count: 7 },
        { project_id: projectId, label: 'Node C', summary: 'C summary', member_count: 1 },
      ]);

      expect(nodes).toHaveLength(3);
      expect(nodes[0].label).toBe('Node A');
      expect(nodes[0].type).toBe('topic'); // default
      expect(nodes[1].type).toBe('entity');
      expect(nodes[2].summary).toBe('C summary');

      // Each node has unique ID
      const ids = new Set(nodes.map((n) => n.id));
      expect(ids.size).toBe(3);
    });

    it('returns empty array for batch insert with empty input', async () => {
      const nodes = await insertKnowledgeNodes(db, []);
      expect(nodes).toHaveLength(0);
    });

    it('finds nodes by project sorted by member_count desc', async () => {
      // Create a fresh project to isolate
      const proj = await insertProject(db, testData.project({ name: 'Sort Test' }));

      await insertKnowledgeNodes(db, [
        { project_id: proj.projectId, label: 'Small', member_count: 1 },
        { project_id: proj.projectId, label: 'Large', member_count: 10 },
        { project_id: proj.projectId, label: 'Medium', member_count: 5 },
      ]);

      const found = await findKnowledgeNodesByProject(db, proj.projectId);
      expect(found).toHaveLength(3);
      expect(found[0].label).toBe('Large');
      expect(found[0].member_count).toBe(10);
      expect(found[1].label).toBe('Medium');
      expect(found[2].label).toBe('Small');
    });

    it('respects limit option on findKnowledgeNodesByProject', async () => {
      const proj = await insertProject(db, testData.project({ name: 'Limit Test' }));

      await insertKnowledgeNodes(db, [
        { project_id: proj.projectId, label: 'A', member_count: 3 },
        { project_id: proj.projectId, label: 'B', member_count: 2 },
        { project_id: proj.projectId, label: 'C', member_count: 1 },
      ]);

      const found = await findKnowledgeNodesByProject(db, proj.projectId, { limit: 2 });
      expect(found).toHaveLength(2);
    });

    it('finds node by ID', async () => {
      const created = await insertKnowledgeNode(db, {
        project_id: projectId,
        label: 'FindMe',
        member_count: 2,
      });

      const found = await findKnowledgeNodeById(db, created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.label).toBe('FindMe');
    });

    it('returns null for non-existent node', async () => {
      const found = await findKnowledgeNodeById(db, 'kn_nonexistent');
      expect(found).toBeNull();
    });

    it('deletes graph by project (cascades to members and edges)', async () => {
      // Create isolated project with full graph
      const proj = await insertProject(db, testData.project({ name: 'Delete Test' }));

      const [nodeA, nodeB] = await insertKnowledgeNodes(db, [
        { project_id: proj.projectId, label: 'Del A', member_count: 2 },
        { project_id: proj.projectId, label: 'Del B', member_count: 1 },
      ]);

      await insertNodeMembers(db, [
        { node_id: nodeA.id, sentence_id: 's_del1', commit_hash: 'sha256:del1' },
        { node_id: nodeB.id, sentence_id: 's_del2', commit_hash: 'sha256:del2' },
      ]);

      await insertKnowledgeEdge(db, {
        project_id: proj.projectId,
        source_node_id: nodeA.id,
        target_node_id: nodeB.id,
        type: 'related_to',
        weight: 0.8,
      });

      // Delete
      const result = await deleteKnowledgeGraphByProject(db, proj.projectId);
      expect(result.nodes_deleted).toBe(2);

      // Verify cascade
      const nodesAfter = await findKnowledgeNodesByProject(db, proj.projectId);
      expect(nodesAfter).toHaveLength(0);

      const membersA = await findMembersByNode(db, nodeA.id);
      expect(membersA).toHaveLength(0);

      const edgesA = await findEdgesByNode(db, nodeA.id);
      expect(edgesA).toHaveLength(0);
    });
  });

  // =========================================================================
  // Member CRUD
  // =========================================================================
  describe('member CRUD', () => {
    let memberNodeId: string;

    beforeAll(async () => {
      const node = await insertKnowledgeNode(db, {
        project_id: projectId,
        label: 'Member Test Node',
        member_count: 3,
      });
      memberNodeId = node.id;

      await insertNodeMembers(db, [
        { node_id: memberNodeId, sentence_id: 's_m1', commit_hash: 'sha256:cm1' },
        { node_id: memberNodeId, sentence_id: 's_m2', commit_hash: 'sha256:cm2' },
        { node_id: memberNodeId, sentence_id: 's_m3', commit_hash: 'sha256:cm3' },
      ]);
    });

    it('inserts node members', async () => {
      const members = await findMembersByNode(db, memberNodeId);
      expect(members).toHaveLength(3);
    });

    it('finds members by node', async () => {
      const members = await findMembersByNode(db, memberNodeId);
      expect(members).toHaveLength(3);

      const sentenceIds = members.map((m) => m.sentence_id).sort();
      expect(sentenceIds).toEqual(['s_m1', 's_m2', 's_m3']);

      // Check all fields
      const first = members.find((m) => m.sentence_id === 's_m1');
      expect(first).toBeDefined();
      expect(first!.node_id).toBe(memberNodeId);
      expect(first!.commit_hash).toBe('sha256:cm1');
    });

    it('reverse lookup: finds node by sentence ID', async () => {
      const nodeId = await findNodeBySentence(db, 's_m2');
      expect(nodeId).toBe(memberNodeId);
    });

    it('returns null when sentence has no node', async () => {
      const nodeId = await findNodeBySentence(db, 's_nonexistent');
      expect(nodeId).toBeNull();
    });

    it('handles empty members insert', async () => {
      // Should not throw
      await insertNodeMembers(db, []);
    });
  });

  // =========================================================================
  // Edge CRUD
  // =========================================================================
  describe('edge CRUD', () => {
    let edgeNodeA: string;
    let edgeNodeB: string;
    let edgeNodeC: string;

    beforeAll(async () => {
      const nodes = await insertKnowledgeNodes(db, [
        { project_id: projectId, label: 'Edge Node A', member_count: 4 },
        { project_id: projectId, label: 'Edge Node B', member_count: 3 },
        { project_id: projectId, label: 'Edge Node C', member_count: 2 },
      ]);
      edgeNodeA = nodes[0].id;
      edgeNodeB = nodes[1].id;
      edgeNodeC = nodes[2].id;
    });

    it('inserts an edge with evidence', async () => {
      const evidence = [
        {
          source_node_key: 's_ea1',
          target_node_key: 's_eb1',
          relation_type: 'supports',
          confidence: 0.9,
        },
      ];

      const edge = await insertKnowledgeEdge(db, {
        project_id: projectId,
        source_node_id: edgeNodeA,
        target_node_id: edgeNodeB,
        type: 'supports',
        weight: 0.85,
        evidence,
      });

      expect(edge).toBeDefined();
      expect(edge.id).toMatch(/^ke_/);
      expect(edge.project_id).toBe(projectId);
      expect(edge.source_node_id).toBe(edgeNodeA);
      expect(edge.target_node_id).toBe(edgeNodeB);
      expect(edge.type).toBe('supports');
      expect(edge.weight).toBeCloseTo(0.85);
      expect(edge.evidence).toHaveLength(1);
      expect(edge.evidence![0].relation_type).toBe('supports');
      expect(edge.evidence![0].confidence).toBeCloseTo(0.9);
      expect(edge.created_at).toBeTruthy();
    });

    it('inserts an edge without evidence', async () => {
      const edge = await insertKnowledgeEdge(db, {
        project_id: projectId,
        source_node_id: edgeNodeB,
        target_node_id: edgeNodeC,
        type: 'related_to',
        weight: 0.5,
      });

      expect(edge.evidence).toBeNull();
    });

    it('batch inserts multiple edges', async () => {
      // Create fresh nodes for this test to avoid conflicts
      const proj = await insertProject(db, testData.project({ name: 'Batch Edge Test' }));
      const nodes = await insertKnowledgeNodes(db, [
        { project_id: proj.projectId, label: 'BE1', member_count: 2 },
        { project_id: proj.projectId, label: 'BE2', member_count: 2 },
        { project_id: proj.projectId, label: 'BE3', member_count: 2 },
      ]);

      const edges = await insertKnowledgeEdges(db, [
        {
          project_id: proj.projectId,
          source_node_id: nodes[0].id,
          target_node_id: nodes[1].id,
          type: 'causes',
          weight: 0.7,
        },
        {
          project_id: proj.projectId,
          source_node_id: nodes[1].id,
          target_node_id: nodes[2].id,
          type: 'contradicts',
          weight: 0.6,
        },
      ]);

      expect(edges).toHaveLength(2);
      const ids = new Set(edges.map((e) => e.id));
      expect(ids.size).toBe(2);
    });

    it('returns empty array for batch insert with empty input', async () => {
      const edges = await insertKnowledgeEdges(db, []);
      expect(edges).toHaveLength(0);
    });

    it('finds edges by node (both directions)', async () => {
      // edgeNodeB has edges: A->B (outgoing from A), B->C (outgoing from B)
      const edges = await findEdgesByNode(db, edgeNodeB);
      // At least A->B and B->C
      expect(edges.length).toBeGreaterThanOrEqual(2);

      // Should include edges where B is source or target
      const sourceIds = edges.map((e) => e.source_node_id);
      const targetIds = edges.map((e) => e.target_node_id);
      const allNodeIds = [...sourceIds, ...targetIds];
      expect(allNodeIds).toContain(edgeNodeB);
    });

    it('finds neighbor nodes with edge info and direction', async () => {
      // Create isolated graph for clean test
      const proj = await insertProject(db, testData.project({ name: 'Neighbor Test' }));
      const nodes = await insertKnowledgeNodes(db, [
        { project_id: proj.projectId, label: 'Center', member_count: 5 },
        { project_id: proj.projectId, label: 'Left', member_count: 3 },
        { project_id: proj.projectId, label: 'Right', member_count: 2 },
      ]);
      const [center, left, right] = nodes;

      // center -> right (outgoing from center)
      await insertKnowledgeEdge(db, {
        project_id: proj.projectId,
        source_node_id: center.id,
        target_node_id: right.id,
        type: 'causes',
        weight: 0.8,
      });

      // left -> center (incoming to center)
      await insertKnowledgeEdge(db, {
        project_id: proj.projectId,
        source_node_id: left.id,
        target_node_id: center.id,
        type: 'supports',
        weight: 0.7,
      });

      const neighbors = await findNeighborNodes(db, center.id);
      expect(neighbors).toHaveLength(2);

      // Check outgoing neighbor
      const outgoing = neighbors.find((n) => n.direction === 'outgoing');
      expect(outgoing).toBeDefined();
      expect(outgoing!.node.id).toBe(right.id);
      expect(outgoing!.node.label).toBe('Right');
      expect(outgoing!.edge.type).toBe('causes');

      // Check incoming neighbor
      const incoming = neighbors.find((n) => n.direction === 'incoming');
      expect(incoming).toBeDefined();
      expect(incoming!.node.id).toBe(left.id);
      expect(incoming!.node.label).toBe('Left');
      expect(incoming!.edge.type).toBe('supports');
    });
  });

  // =========================================================================
  // Search
  // =========================================================================
  describe('search', () => {
    let searchProjectId: string;

    beforeAll(async () => {
      const proj = await insertProject(db, testData.project({ name: 'Search Test' }));
      searchProjectId = proj.projectId;

      await insertKnowledgeNodes(db, [
        { project_id: searchProjectId, label: 'Deep Learning', member_count: 8 },
        { project_id: searchProjectId, label: 'Machine Learning Basics', member_count: 5 },
        { project_id: searchProjectId, label: 'Natural Language Processing', member_count: 3 },
        { project_id: searchProjectId, label: 'Computer Vision', member_count: 2 },
      ]);
    });

    it('searches nodes by label substring (case insensitive)', async () => {
      const results = await searchKnowledgeNodes(db, searchProjectId, 'learning');
      expect(results).toHaveLength(2);
      // Sorted by member_count desc
      expect(results[0].label).toBe('Deep Learning');
      expect(results[1].label).toBe('Machine Learning Basics');
    });

    it('case insensitive search works', async () => {
      const results = await searchKnowledgeNodes(db, searchProjectId, 'LEARNING');
      expect(results).toHaveLength(2);
    });

    it('returns empty for non-matching query', async () => {
      const results = await searchKnowledgeNodes(db, searchProjectId, 'blockchain');
      expect(results).toHaveLength(0);
    });

    it('respects limit option', async () => {
      const results = await searchKnowledgeNodes(db, searchProjectId, 'l', { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('does not return nodes from other projects', async () => {
      const results = await searchKnowledgeNodes(db, 'proj_nonexistent', 'learning');
      expect(results).toHaveLength(0);
    });
  });
});
