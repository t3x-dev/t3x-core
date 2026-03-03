/**
 * Canvas Store Tests
 *
 * Tests for the Zustand canvas store that manages canvas nodes, edges,
 * and unit/branch operations.
 *
 * Focus areas:
 * 1. Core state management functions
 * 2. Error handling (no silent failures)
 * 3. API integration points
 * 4. Edge cases
 */

import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

// Mock the API module
vi.mock('@/lib/api', () => ({
  listTurns: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  listCommitsV3: vi.fn(),
  listConversations: vi.fn(),
  listBranches: vi.fn(),
  getProject: vi.fn(),
  getTurn: vi.fn(),
  getAuthHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })),
  createLeaf: vi.fn().mockResolvedValue({
    id: 'leaf_mock123',
    commit_hash: 'sha256:abc123',
    type: 'tweet',
    title: 'Twitter',
    constraints: [],
    config: {},
    output: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
}));

// Helper to create a mock staging unit node
const createStagingUnitNode = (
  id: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'unit',
  position: { x: 0, y: 0 },
  data: {
    kind: 'unit',
    entryId: id,
    title: 'Test Unit',
    summary: '0 turns',
    status: 'staging',
    timestamp: 'just now',
    tags: ['unit'],
    commitStatus: 'staging',
    conversationId: `conv_${id}`,
    ...overrides,
  },
});

// Helper to create a mock committed unit node
const createCommittedUnitNode = (
  id: string,
  commitHash: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'unit',
  position: { x: 100, y: 0 },
  data: {
    kind: 'unit',
    entryId: id,
    title: 'Committed Unit',
    summary: '3 facets',
    status: 'committed',
    timestamp: new Date().toISOString(),
    tags: ['unit'],
    commitStatus: 'committed',
    commitHash,
    conversationId: `conv_${id}`,
    branchType: 'main',
    ...overrides,
  },
});

// Helper to create a mock leaf node
const _createLeafNode = (
  id: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'leaf',
  position: { x: 200, y: 0 },
  data: {
    kind: 'leaf',
    entryId: id,
    title: 'Deploy',
    summary: '',
    status: 'pending',
    timestamp: 'just now',
    tags: ['leaf', 'deploy_agent'],
    leafType: 'deploy_agent',
    ...overrides,
  },
});

// Helper to reset store between tests
const resetStore = () => {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    hasMainCommit: false,
    latestMainCommitId: undefined,
    projectId: null,
    loading: false,
    loadError: null,
    leafPanelOpen: false,
    leafPanelCommitId: undefined,
    deletionConfirmation: null,
  });
};

describe('Canvas Store - Unit Node Model', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Don't use vi.restoreAllMocks() as it removes mock implementations
    // vi.clearAllMocks() in beforeEach is sufficient
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('has empty nodes array initially', () => {
      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });

    it('has empty edges array initially', () => {
      const state = useCanvasStore.getState();
      expect(state.edges).toEqual([]);
    });

    it('has no main commit initially', () => {
      const state = useCanvasStore.getState();
      expect(state.hasMainCommit).toBe(false);
    });

    it('is not loading initially', () => {
      const state = useCanvasStore.getState();
      expect(state.loading).toBe(false);
    });
  });

  // ===========================================================================
  // Unit Node Type Tests
  // ===========================================================================
  describe('Unit Node Types', () => {
    it('staging unit has commitStatus = staging', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      expect(stagingUnit.data.kind).toBe('unit');
      expect(stagingUnit.data.commitStatus).toBe('staging');
    });

    it('committed unit has commitStatus = committed', () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      expect(committedUnit.data.kind).toBe('unit');
      expect(committedUnit.data.commitStatus).toBe('committed');
      expect(committedUnit.data.commitHash).toBe('sha256:abc123');
    });

    it('unit node contains both conversationId and commitHash', () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      expect(committedUnit.data.conversationId).toBeDefined();
      expect(committedUnit.data.commitHash).toBeDefined();
    });
  });

  // ===========================================================================
  // Connection Rules Tests (Unit → Unit, Unit → Leaf)
  // ===========================================================================
  describe('Connection Rules', () => {
    it('allows unit to connect to staging unit', () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      const stagingUnit = createStagingUnitNode('unit-2');
      useCanvasStore.setState({ nodes: [committedUnit, stagingUnit], edges: [] });

      useCanvasStore.getState().onConnect({
        source: 'unit-1',
        target: 'unit-2',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      expect(state.edges.length).toBe(1);
      expect(state.edges[0].source).toBe('unit-1');
      expect(state.edges[0].target).toBe('unit-2');
    });

    it('does not allow connecting to committed unit', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      const committedUnit = createCommittedUnitNode('unit-2', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [stagingUnit, committedUnit], edges: [] });

      useCanvasStore.getState().onConnect({
        source: 'unit-1',
        target: 'unit-2',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      // Edge should not be created - committed units cannot accept new connections
      expect(state.edges.length).toBe(0);
    });

    it('does not allow self-connection', () => {
      const unit = createStagingUnitNode('unit-1');
      useCanvasStore.setState({ nodes: [unit], edges: [] });

      useCanvasStore.getState().onConnect({
        source: 'unit-1',
        target: 'unit-1',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      expect(state.edges.length).toBe(0);
    });
  });

  // ===========================================================================
  // Commit Unit Tests (staging → committed)
  // ===========================================================================
  describe('commitPendingCommit (staging → committed)', () => {
    it('changes staging unit to committed status', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      useCanvasStore.setState({ nodes: [stagingUnit], edges: [] });

      useCanvasStore.getState().commitPendingCommit('unit-1');

      const state = useCanvasStore.getState();
      const updatedNode = state.nodes.find((n) => n.id === 'unit-1');
      expect(updatedNode?.data.commitStatus).toBe('committed');
    });

    it('does nothing when node not found', () => {
      useCanvasStore.setState({ nodes: [], edges: [] });

      useCanvasStore.getState().commitPendingCommit('nonexistent');

      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });

    it('does nothing when node is already committed', () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [committedUnit], edges: [] });

      useCanvasStore.getState().commitPendingCommit('unit-1');

      // Should remain unchanged
      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.commitStatus).toBe('committed');
    });

    it('updates hasMainCommit when first unit is committed to main', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      useCanvasStore.setState({
        nodes: [stagingUnit],
        edges: [],
        hasMainCommit: false,
      });

      useCanvasStore.getState().commitPendingCommit('unit-1');

      const state = useCanvasStore.getState();
      // First commit should go to main
      expect(state.hasMainCommit).toBe(true);
    });
  });

  // ===========================================================================
  // Leaf Panel Tests
  // ===========================================================================
  describe('Leaf Panel', () => {
    it('opens leaf panel for a committed unit', () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [committedUnit], edges: [] });

      useCanvasStore.getState().openLeafPanel('unit-1');

      const state = useCanvasStore.getState();
      expect(state.leafPanelOpen).toBe(true);
      expect(state.leafPanelCommitId).toBe('unit-1');
    });

    it('closes leaf panel', () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: 'unit-1',
      });

      useCanvasStore.getState().closeLeafPanel();

      const state = useCanvasStore.getState();
      expect(state.leafPanelOpen).toBe(false);
      expect(state.leafPanelCommitId).toBeUndefined();
    });
  });

  // ===========================================================================
  // addLeafNode Tests
  // ===========================================================================
  describe('addLeafNode', () => {
    it('embeds a leaf into the parent commit node data.leaves', async () => {
      const committedUnit = createCommittedUnitNode('unit-1', 'sha256:abc123');
      useCanvasStore.setState({
        nodes: [committedUnit],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: 'unit-1',
        projectId: 'proj_test123',
      });

      await useCanvasStore.getState().addLeafNode('tweet');

      const state = useCanvasStore.getState();
      // No new node created — leaf is embedded
      expect(state.nodes.length).toBe(1);
      // No edge created
      expect(state.edges.length).toBe(0);
      // Leaf embedded in parent node's data.leaves
      const unitNode = state.nodes[0];
      expect(unitNode.data.leaves).toBeDefined();
      expect(unitNode.data.leaves!.length).toBe(1);
      expect(unitNode.data.leaves![0].type).toBe('tweet');
      expect(unitNode.data.leaves![0].title).toBe('Twitter');
    });

    it('does nothing when leafPanelCommitId is not set', async () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: undefined,
      });

      await useCanvasStore.getState().addLeafNode('tweet');

      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });
  });

  // ===========================================================================
  // updateNode Tests
  // ===========================================================================
  describe('updateNode', () => {
    it('updates unit node data with patch', () => {
      const unit = createStagingUnitNode('unit-1', { title: 'Old Title' });
      useCanvasStore.setState({ nodes: [unit], edges: [] });

      useCanvasStore.getState().updateNode('unit-1', { title: 'New Title' });

      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.title).toBe('New Title');
    });

    it('does not affect other nodes', () => {
      const unit1 = createStagingUnitNode('unit-1', { title: 'Title 1' });
      const unit2 = createStagingUnitNode('unit-2', { title: 'Title 2' });
      useCanvasStore.setState({ nodes: [unit1, unit2], edges: [] });

      useCanvasStore.getState().updateNode('unit-1', { title: 'Updated' });

      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.title).toBe('Updated');
      expect(state.nodes[1].data.title).toBe('Title 2');
    });
  });

  // ===========================================================================
  // clearCanvas Tests
  // ===========================================================================
  describe('clearCanvas', () => {
    it('clears all nodes and edges', () => {
      const unit = createStagingUnitNode('unit-1');
      useCanvasStore.setState({
        nodes: [unit],
        edges: [{ id: 'e1', source: 'unit-1', target: 'unit-2' }],
      });

      useCanvasStore.getState().clearCanvas();

      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
    });

    it('resets main commit state', () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        hasMainCommit: true,
        latestMainCommitId: 'unit-1',
      });

      useCanvasStore.getState().clearCanvas();

      const state = useCanvasStore.getState();
      expect(state.hasMainCommit).toBe(false);
      expect(state.latestMainCommitId).toBeUndefined();
    });
  });

  // ===========================================================================
  // getCommitTone Tests
  // ===========================================================================
  describe('getCommitTone (Unit Tone)', () => {
    it('returns main-latest for the latest main unit', () => {
      const mainUnit = createCommittedUnitNode('unit-1', 'sha256:abc123', {
        branchType: 'main',
      });
      useCanvasStore.setState({
        nodes: [mainUnit],
        edges: [],
        hasMainCommit: true,
        latestMainCommitId: 'unit-1',
      });

      const tone = useCanvasStore.getState().getCommitTone('unit-1');
      expect(tone).toBe('main-latest');
    });

    it('returns main-history for older main units', () => {
      const oldMain = createCommittedUnitNode('unit-1', 'sha256:old', {
        branchType: 'main',
        timestamp: '2024-01-01T00:00:00Z',
      });
      const newMain = createCommittedUnitNode('unit-2', 'sha256:new', {
        branchType: 'main',
        timestamp: '2024-12-01T00:00:00Z',
      });
      useCanvasStore.setState({
        nodes: [oldMain, newMain],
        edges: [{ id: 'e1', source: 'unit-1', target: 'unit-2' }],
        hasMainCommit: true,
        latestMainCommitId: 'unit-2',
      });

      const tone = useCanvasStore.getState().getCommitTone('unit-1');
      expect(tone).toBe('main-history');
    });

    it('returns branch-latest for the latest branch unit', () => {
      const mainUnit = createCommittedUnitNode('unit-1', 'sha256:main', {
        branchType: 'main',
      });
      const branchUnit = createCommittedUnitNode('unit-2', 'sha256:branch', {
        branchType: 'branch',
        branchName: 'feature-x',
      });
      useCanvasStore.setState({
        nodes: [mainUnit, branchUnit],
        edges: [{ id: 'e1', source: 'unit-1', target: 'unit-2' }],
        hasMainCommit: true,
        latestMainCommitId: 'unit-1',
      });

      const tone = useCanvasStore.getState().getCommitTone('unit-2');
      expect(tone).toBe('branch-latest');
    });
  });

  // ===========================================================================
  // Node Locking Tests
  // ===========================================================================
  describe('Node Locking (Committed Units)', () => {
    it('committed units and their upstream are protected from deletion', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      const committedUnit = createCommittedUnitNode('unit-2', 'sha256:abc123');
      useCanvasStore.setState({
        nodes: [stagingUnit, committedUnit],
        edges: [{ id: 'e1', source: 'unit-1', target: 'unit-2' }],
      });

      // Try to delete the committed unit via node change
      useCanvasStore.getState().onNodesChange([{ id: 'unit-2', type: 'remove' }]);

      const state = useCanvasStore.getState();
      // Committed unit should still exist (protected)
      expect(state.nodes.find((n) => n.id === 'unit-2')).toBeDefined();
    });

    it('staging units can be deleted', () => {
      const stagingUnit = createStagingUnitNode('unit-1');
      useCanvasStore.setState({
        nodes: [stagingUnit],
        edges: [],
      });

      // Delete staging unit
      useCanvasStore.getState().onNodesChange([{ id: 'unit-1', type: 'remove' }]);

      const _state = useCanvasStore.getState();
      // May trigger confirmation dialog, but node should be removable
      // The exact behavior depends on isUpstreamOfStagingUnit
    });
  });

  // ===========================================================================
  // Merge Store Tests
  // ===========================================================================
  describe('Merge Store', () => {
    beforeEach(() => {
      // Reset store and clear all mocks
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        hasMainCommit: false,
        mergeState: null,
      });
      vi.clearAllMocks();
    });

    it('startMerge sets mergeState', async () => {
      // Mock fetch
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                identical: [],
                similarPairs: [],
                onlyInSource: [],
                onlyInTarget: [],
              },
            }),
        })
      ) as unknown as typeof fetch;

      await useCanvasStore.getState().startMerge('sha256:a', 'sha256:b');

      expect(useCanvasStore.getState().mergeState).not.toBeNull();
      expect(useCanvasStore.getState().mergeState?.sourceHash).toBe('sha256:a');
      expect(useCanvasStore.getState().mergeState?.targetHash).toBe('sha256:b');
      expect(useCanvasStore.getState().mergeError).toBeNull();
      expect(useCanvasStore.getState().mergeLoading).toBe(false);
    });

    it('resolveSimilarPair updates resolution', () => {
      // Setup with existing mergeState
      const store = useCanvasStore.getState();
      useCanvasStore.setState({
        mergeState: {
          sourceHash: 'sha256:a',
          targetHash: 'sha256:b',
          prepared: {
            identical: [],
            similarPairs: [
              {
                source: {
                  id: 's1',
                  text: 'Hello world.',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv1' },
                },
                target: {
                  id: 't1',
                  text: 'Hello world!',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv2' },
                },
                wordDiff: [],
                sourceConstraints: [],
                targetConstraints: [],
              },
            ],
            onlyInSource: [],
            onlyInTarget: [],
          },
        },
      });

      store.resolveSimilarPair(0, 'source');

      expect(useCanvasStore.getState().mergeState?.prepared.similarPairs[0].resolution).toBe(
        'source'
      );
    });

    it('toggleKeep flips boolean', () => {
      useCanvasStore.setState({
        mergeState: {
          sourceHash: 'sha256:a',
          targetHash: 'sha256:b',
          prepared: {
            identical: [],
            similarPairs: [],
            onlyInSource: [
              {
                sentence: {
                  id: 's1',
                  text: 'Unique sentence.',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv1' },
                },
                constraints: [],
                keep: true,
              },
            ],
            onlyInTarget: [],
          },
        },
      });

      const initialKeep = useCanvasStore.getState().mergeState?.prepared.onlyInSource[0].keep;

      useCanvasStore.getState().toggleKeep('source', 0);

      expect(useCanvasStore.getState().mergeState?.prepared.onlyInSource[0].keep).toBe(false);
      expect(useCanvasStore.getState().mergeState?.prepared.onlyInSource[0].keep).toBe(
        !initialKeep
      );
    });

    it('cancelMerge clears state', () => {
      useCanvasStore.setState({
        mergeState: {
          sourceHash: 'sha256:a',
          targetHash: 'sha256:b',
          prepared: {
            identical: [],
            similarPairs: [],
            onlyInSource: [],
            onlyInTarget: [],
          },
        },
      });

      const store = useCanvasStore.getState();
      store.cancelMerge();

      expect(useCanvasStore.getState().mergeState).toBeNull();
    });

    it('selectCanExecuteMerge returns true when all resolved', async () => {
      const { selectCanExecuteMerge } = await import('@/store/canvasStore');

      // Setup with all pairs resolved
      const state = {
        mergeState: {
          sourceHash: 'sha256:a',
          targetHash: 'sha256:b',
          prepared: {
            identical: [],
            similarPairs: [
              {
                source: {
                  id: 's1',
                  text: 'Hello',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv1' },
                },
                target: {
                  id: 't1',
                  text: 'Hi',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv2' },
                },
                wordDiff: [],
                resolution: 'source' as const,
                sourceConstraints: [],
                targetConstraints: [],
              },
            ],
            onlyInSource: [],
            onlyInTarget: [],
          },
        },
      } as unknown as Parameters<typeof selectCanExecuteMerge>[0];

      expect(selectCanExecuteMerge(state)).toBe(true);
    });

    it('selectCanExecuteMerge returns false when unresolved', async () => {
      const { selectCanExecuteMerge } = await import('@/store/canvasStore');

      const state = {
        mergeState: {
          sourceHash: 'sha256:a',
          targetHash: 'sha256:b',
          prepared: {
            identical: [],
            similarPairs: [
              {
                source: {
                  id: 's1',
                  text: 'Hello',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv1' },
                },
                target: {
                  id: 't1',
                  text: 'Hi',
                  confidence: 0.9,
                  source: { type: 'conversation', id: 'conv2' },
                },
                wordDiff: [],
                resolution: undefined,
                sourceConstraints: [],
                targetConstraints: [],
              },
            ],
            onlyInSource: [],
            onlyInTarget: [],
          },
        },
      } as unknown as Parameters<typeof selectCanExecuteMerge>[0];

      expect(selectCanExecuteMerge(state)).toBe(false);
    });
  });
});
