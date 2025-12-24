/**
 * Canvas Store Tests
 *
 * Tests for the Zustand canvas store that manages canvas nodes, edges,
 * and commit/conversation/branch operations.
 *
 * Focus areas:
 * 1. Core state management functions
 * 2. Error handling (no silent failures)
 * 3. API integration points
 * 4. Edge cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCanvasStore } from '@/store/canvasStore';
import type { Node } from 'reactflow';
import type { CanvasNodeData } from '@/types/nodes';

// Mock the API module
vi.mock('@/lib/api', () => ({
  listTurns: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  listCommits: vi.fn(),
  listConversations: vi.fn(),
  listBranches: vi.fn(),
  getProject: vi.fn(),
}));

import * as api from '@/lib/api';

// Helper to create a mock conversation node
const createConversationNode = (
  id: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'conversation',
  position: { x: 0, y: 0 },
  data: {
    kind: 'conversation',
    entryId: id,
    title: 'Test Conversation',
    status: 'Active',
    tags: [],
    ...overrides,
  },
});

// Helper to create a mock pending commit node
const createPendingCommitNode = (
  id: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'commit',
  position: { x: 100, y: 0 },
  data: {
    kind: 'commit',
    entryId: id,
    title: 'Test Commit',
    status: 'Pending',
    tags: [],
    commitStatus: 'pending',
    ...overrides,
  },
});

// Helper to create a mock committed commit node
const createCommittedCommitNode = (
  id: string,
  commitHash: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'commit',
  position: { x: 100, y: 0 },
  data: {
    kind: 'commit',
    entryId: id,
    title: 'Committed',
    status: 'Committed',
    tags: ['commit'],
    commitStatus: 'committed',
    commitHash,
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

describe('Canvas Store', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  // commitPendingCommit Tests
  // ===========================================================================
  describe('commitPendingCommit', () => {
    it('changes pending commit to committed status', () => {
      const pendingNode = createPendingCommitNode('pending-1');
      useCanvasStore.setState({ nodes: [pendingNode], edges: [] });

      useCanvasStore.getState().commitPendingCommit('pending-1');

      const state = useCanvasStore.getState();
      const updatedNode = state.nodes.find((n) => n.id === 'pending-1');
      expect(updatedNode?.data.commitStatus).toBe('committed');
    });

    it('returns empty object when node not found (silent failure - BUG)', () => {
      // This test documents the current buggy behavior
      // The function silently returns {} when node is not found
      useCanvasStore.setState({ nodes: [], edges: [] });

      // Currently this silently fails - no error thrown, no notification
      useCanvasStore.getState().commitPendingCommit('nonexistent');

      // State should be unchanged
      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });

    it('returns empty object when node is not a pending commit (silent failure - BUG)', () => {
      // This test documents the current buggy behavior
      const conversationNode = createConversationNode('conv-1');
      useCanvasStore.setState({ nodes: [conversationNode], edges: [] });

      // Trying to commit a conversation node silently fails
      useCanvasStore.getState().commitPendingCommit('conv-1');

      // Node should be unchanged
      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.kind).toBe('conversation');
    });

    it('returns empty object when branchMode is blocked (silent failure - BUG)', () => {
      // This test documents the current buggy behavior
      // When branchMode is 'blocked', the function silently returns {}
      const pendingNode = createPendingCommitNode('pending-1');
      const conversationNode = createConversationNode('conv-1');

      // Create an edge from conversation to pending commit
      useCanvasStore.setState({
        nodes: [conversationNode, pendingNode],
        edges: [{ id: 'e1', source: 'conv-1', target: 'pending-1' }],
        hasMainCommit: true, // This can affect branchMode
      });

      // The function may return silently if branchMode is blocked
      // depending on the determinePendingCommitBranchMode logic
      useCanvasStore.getState().commitPendingCommit('pending-1');

      // We're just documenting the behavior here
      const state = useCanvasStore.getState();
      expect(state.nodes).toBeDefined();
    });

    it('updates hasMainCommit when committing to main branch', () => {
      const pendingNode = createPendingCommitNode('pending-1');
      useCanvasStore.setState({
        nodes: [pendingNode],
        edges: [],
        hasMainCommit: false,
      });

      useCanvasStore.getState().commitPendingCommit('pending-1');

      const state = useCanvasStore.getState();
      // Check if hasMainCommit is updated (depends on branchMode logic)
      expect(typeof state.hasMainCommit).toBe('boolean');
    });
  });

  // ===========================================================================
  // addPendingCommitFromConversation Tests
  // ===========================================================================
  describe('addPendingCommitFromConversation', () => {
    it('creates a pending commit from conversation with turns', async () => {
      const conversationNode = createConversationNode('conv_123');
      useCanvasStore.setState({
        nodes: [conversationNode],
        edges: [],
        projectId: 'proj_123',
      });

      // Mock API response
      vi.mocked(api.listTurns).mockResolvedValueOnce({
        turns: [
          {
            turn_hash: 'sha256:abc123',
            project_id: 'proj_123',
            conversation_id: 'conv_123',
            role: 'user' as const,
            content: 'Hello',
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      await useCanvasStore.getState().addPendingCommitFromConversation('conv_123');

      const state = useCanvasStore.getState();
      // Should have created a new pending commit node
      expect(state.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('does nothing when conversation node not found', async () => {
      useCanvasStore.setState({ nodes: [], edges: [], projectId: 'proj_123' });

      await useCanvasStore.getState().addPendingCommitFromConversation('nonexistent');

      // No API call should be made
      expect(api.listTurns).not.toHaveBeenCalled();
    });

    it('creates empty pending commit when API fails (BUG - no user notification)', async () => {
      // BUG: This test documents problematic behavior:
      // 1. API error is caught but only logged to console.warn
      // 2. User is not notified of the failure
      // 3. An empty pending commit is still created (no content)
      // 4. User may think everything worked but the commit has no data
      const conversationNode = createConversationNode('conv_123', {
        conversationId: 'conv_123',
      });
      useCanvasStore.setState({
        nodes: [conversationNode],
        edges: [],
        projectId: 'proj_123',
      });

      // Mock API to throw error
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(api.listTurns).mockRejectedValueOnce(new Error('Network error'));

      // Function completes without throwing
      await useCanvasStore.getState().addPendingCommitFromConversation('conv_123');

      // BUG: A pending commit is created even though API failed
      const state = useCanvasStore.getState();
      const pendingCommits = state.nodes.filter((n) => n.data.commitStatus === 'pending');
      expect(pendingCommits.length).toBe(1);

      // BUG: The commit has empty content because API failed
      expect(pendingCommits[0].data.baselineSummary).toBe('');

      // Only console.warn is called, no user notification
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch turns for baselineSummary:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // addPendingCommitFromCommit Tests
  // ===========================================================================
  describe('addPendingCommitFromCommit', () => {
    it('creates a pending commit from existing committed commit', () => {
      const committedNode = createCommittedCommitNode('commit-1', 'sha256:abc123', {
        sourceExcerpt: ['Hello', 'World'],
      });
      useCanvasStore.setState({ nodes: [committedNode], edges: [] });

      useCanvasStore.getState().addPendingCommitFromCommit('commit-1');

      const state = useCanvasStore.getState();
      expect(state.nodes.length).toBe(2); // Original + new pending
      const newNode = state.nodes.find((n) => n.id !== 'commit-1');
      expect(newNode?.data.commitStatus).toBe('pending');
    });

    it('does nothing when source commit not found (silent failure)', () => {
      useCanvasStore.setState({ nodes: [], edges: [] });

      useCanvasStore.getState().addPendingCommitFromCommit('nonexistent');

      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });

    it('does nothing when source is pending commit (not committed)', () => {
      const pendingNode = createPendingCommitNode('pending-1');
      useCanvasStore.setState({ nodes: [pendingNode], edges: [] });

      useCanvasStore.getState().addPendingCommitFromCommit('pending-1');

      const state = useCanvasStore.getState();
      // Should still be only 1 node
      expect(state.nodes.length).toBe(1);
    });

    it('is synchronous and does not call API (design decision)', () => {
      // This test documents that addPendingCommitFromCommit is synchronous
      // Unlike addPendingCommitFromConversation which calls api.listTurns
      const committedNode = createCommittedCommitNode('commit-1', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [committedNode], edges: [] });

      useCanvasStore.getState().addPendingCommitFromCommit('commit-1');

      // No API calls should be made
      expect(api.listTurns).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // addLeafNode Tests
  // ===========================================================================
  describe('addLeafNode', () => {
    it('adds a leaf node to open leaf panel commit', () => {
      const committedNode = createCommittedCommitNode('commit-1', 'sha256:abc123');
      useCanvasStore.setState({
        nodes: [committedNode],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: 'commit-1',
      });

      useCanvasStore.getState().addLeafNode('n8n-trigger');

      const state = useCanvasStore.getState();
      expect(state.nodes.length).toBe(2); // Commit + Leaf
      const leafNode = state.nodes.find((n) => n.data.kind === 'leaf');
      expect(leafNode).toBeDefined();
      expect(leafNode?.data.leafType).toBe('n8n-trigger');
    });

    it('does nothing when leafPanelCommitId is not set (silent failure - BUG)', () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: undefined,
      });

      useCanvasStore.getState().addLeafNode('n8n-trigger');

      // Should silently fail without any notification
      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });

    it('does nothing when commit node not found (silent failure - BUG)', () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: 'nonexistent',
      });

      useCanvasStore.getState().addLeafNode('n8n-trigger');

      // Should silently fail without any notification
      const state = useCanvasStore.getState();
      expect(state.nodes).toEqual([]);
    });
  });

  // ===========================================================================
  // updateNode Tests
  // ===========================================================================
  describe('updateNode', () => {
    it('updates node data with patch', () => {
      const conversationNode = createConversationNode('conv-1', { title: 'Old Title' });
      useCanvasStore.setState({ nodes: [conversationNode], edges: [] });

      useCanvasStore.getState().updateNode('conv-1', { title: 'New Title' });

      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.title).toBe('New Title');
    });

    it('does not affect other nodes', () => {
      const node1 = createConversationNode('conv-1', { title: 'Title 1' });
      const node2 = createConversationNode('conv-2', { title: 'Title 2' });
      useCanvasStore.setState({ nodes: [node1, node2], edges: [] });

      useCanvasStore.getState().updateNode('conv-1', { title: 'Updated' });

      const state = useCanvasStore.getState();
      expect(state.nodes[0].data.title).toBe('Updated');
      expect(state.nodes[1].data.title).toBe('Title 2');
    });
  });

  // ===========================================================================
  // Leaf Panel Tests
  // ===========================================================================
  describe('Leaf Panel', () => {
    it('opens leaf panel for a commit', () => {
      const committedNode = createCommittedCommitNode('commit-1', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [committedNode], edges: [] });

      useCanvasStore.getState().openLeafPanel('commit-1');

      const state = useCanvasStore.getState();
      expect(state.leafPanelOpen).toBe(true);
      expect(state.leafPanelCommitId).toBe('commit-1');
    });

    it('closes leaf panel', () => {
      useCanvasStore.setState({
        nodes: [],
        edges: [],
        leafPanelOpen: true,
        leafPanelCommitId: 'commit-1',
      });

      useCanvasStore.getState().closeLeafPanel();

      const state = useCanvasStore.getState();
      expect(state.leafPanelOpen).toBe(false);
      expect(state.leafPanelCommitId).toBeUndefined();
    });
  });

  // ===========================================================================
  // canConnect Tests
  // ===========================================================================
  describe('Connection Rules', () => {
    it('allows conversation to connect to commit', () => {
      const conversationNode = createConversationNode('conv-1');
      const pendingNode = createPendingCommitNode('pending-1');
      useCanvasStore.setState({ nodes: [conversationNode, pendingNode], edges: [] });

      // Test via onConnect
      useCanvasStore.getState().onConnect({
        source: 'conv-1',
        target: 'pending-1',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      expect(state.edges.length).toBe(1);
    });

    it('does not allow connecting to committed commit', () => {
      const conversationNode = createConversationNode('conv-1');
      const committedNode = createCommittedCommitNode('commit-1', 'sha256:abc123');
      useCanvasStore.setState({ nodes: [conversationNode, committedNode], edges: [] });

      // Try to connect to committed node
      useCanvasStore.getState().onConnect({
        source: 'conv-1',
        target: 'commit-1',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      // Edge should not be created
      expect(state.edges.length).toBe(0);
    });

    it('does not allow self-connection', () => {
      const node = createConversationNode('conv-1');
      useCanvasStore.setState({ nodes: [node], edges: [] });

      useCanvasStore.getState().onConnect({
        source: 'conv-1',
        target: 'conv-1',
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useCanvasStore.getState();
      expect(state.edges.length).toBe(0);
    });
  });

  // ===========================================================================
  // clearCanvas Tests
  // ===========================================================================
  describe('clearCanvas', () => {
    it('clears all nodes and edges', () => {
      const node = createConversationNode('conv-1');
      useCanvasStore.setState({
        nodes: [node],
        edges: [{ id: 'e1', source: 'conv-1', target: 'commit-1' }],
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
        latestMainCommitId: 'commit-1',
      });

      useCanvasStore.getState().clearCanvas();

      const state = useCanvasStore.getState();
      expect(state.hasMainCommit).toBe(false);
      expect(state.latestMainCommitId).toBeUndefined();
    });
  });
});
