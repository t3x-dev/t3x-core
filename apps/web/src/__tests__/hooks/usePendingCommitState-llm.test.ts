// @vitest-environment jsdom
/**
 * Tests for usePendingCommitState — LLM commit flow
 *
 * Verifies: draft creation on Proceed, extraction failure handling,
 * commit via commitWorkbenchDraft, reset clears state.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock the api module
vi.mock('@/lib/api', () => ({
  createWorkbenchDraft: vi.fn(),
  extractIncremental: vi.fn(),
  commitWorkbenchDraft: vi.fn(),
  listBranches: vi.fn(() => Promise.resolve({ branches: [] })),
  diffRaw: vi.fn(),
  createBranch: vi.fn(),
}));

// Mock canvas store
const mockCanvasStore = {
  hasMainCommit: false,
  latestMainCommitId: null as string | null,
  nodes: [] as Array<{ id: string; data: Record<string, unknown> }>,
  edges: [] as Array<{ source: string; target: string }>,
  updateNodeId: vi.fn(),
  loadProjectData: vi.fn(),
  openLeafPanel: vi.fn(),
  getState: () => mockCanvasStore,
};

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (s: typeof mockCanvasStore) => unknown) => selector(mockCanvasStore),
    { getState: () => mockCanvasStore }
  ),
}));

import type { Node } from '@xyflow/react';
import { usePendingCommitState } from '@/hooks/usePendingCommitState';
import * as api from '@/lib/api';
import type { CanvasNodeData } from '@/types/nodes';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<CanvasNodeData> = {}): Node<CanvasNodeData> {
  return {
    id: 'node-1',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      title: 'Test Commit',
      entryId: 'entry-1',
      commitStatus: 'pending',
      conversationId: 'conv_123',
      sourceConversationId: 'conv_123',
      pendingBranch: 'main',
      ...overrides,
    } as CanvasNodeData,
  } as Node<CanvasNodeData>;
}

const mockDraft = {
  id: 'draft_abc',
  project_id: 'proj_1',
  title: 'Test',
  goal: null,
  parent_commit_hash: null,
  forked_from: null,
  sentences: [],
  constraints: [],
  instructions: null,
  preview_type: null,
  preview_output: null,
  preview_generated_at: null,
  status: 'editing' as const,
  committed_as: null,
  committed_leaf_id: null,
  target_branch: 'main',
  revision: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockExtractResult = {
  ready_points: [
    {
      id: 'sp_1',
      text: 'User prefers dark mode',
      extraction_mode: 'llm_extracted' as const,
      status: 'auto_landed' as const,
      zone: 'ready' as const,
      evidence: [],
      position: 0,
      staged: true,
    },
  ],
  review_points: [
    {
      id: 'sp_2',
      text: 'Implicit preference for minimal UI',
      extraction_mode: 'llm_extracted' as const,
      inference_type: 'implicit' as const,
      status: 'auto_landed' as const,
      zone: 'review' as const,
      evidence: [],
      position: 1,
      staged: true,
    },
  ],
  cursor: { cursors: {} },
  stats: {
    total_turns: 5,
    new_turns: 5,
    proposals: 2,
    auto_landed: 1,
    needs_review: 1,
    rejected: 0,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePendingCommitState — LLM commit flow', () => {
  const onClose = vi.fn();
  const onUpdate = vi.fn();
  const onConvertDraft = vi.fn();
  const projectId = 'proj_1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasStore.hasMainCommit = false;
    mockCanvasStore.latestMainCommitId = null;
    mockCanvasStore.nodes = [];
    mockCanvasStore.edges = [];
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('creates draft and triggers extraction on handleProceed', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractResult);

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    // Initially: no draft, no extraction
    expect(result.current.draftId).toBeNull();
    expect(result.current.semanticPoints).toHaveLength(0);
    expect(result.current.configLocked).toBe(false);

    // Act: call handleProceed
    await act(async () => {
      await result.current.handleProceed();
    });

    // Assert: draft created
    expect(api.createWorkbenchDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj_1',
        title: 'Test Commit',
        target_branch: 'main',
      })
    );

    // Assert: extraction triggered
    expect(api.extractIncremental).toHaveBeenCalledWith('proj_1', 'conv_123', 'draft_abc');

    // Assert: state updated
    expect(result.current.draftId).toBe('draft_abc');
    expect(result.current.semanticPoints).toHaveLength(2);
    expect(result.current.configLocked).toBe(true);
    expect(result.current.extractionLoading).toBe(false);
    expect(result.current.extractionError).toBeNull();
  });

  it('sets extractionError when extraction fails', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('LLM API key missing')
    );

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    await act(async () => {
      await result.current.handleProceed();
    });

    expect(result.current.extractionError).toBe('LLM API key missing');
    expect(result.current.semanticPoints).toHaveLength(0);
    expect(result.current.extractionLoading).toBe(false);
    // configLocked should revert on failure
    expect(result.current.configLocked).toBe(false);
  });

  it('commits via commitWorkbenchDraft', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractResult);
    (api.commitWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      commit: { hash: 'sha256:abc123' },
      leaf: null,
      draft_status: 'committed',
    });

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    // First: proceed to create draft + extract
    await act(async () => {
      await result.current.handleProceed();
    });

    expect(result.current.draftId).toBe('draft_abc');

    // Then: commit
    await act(async () => {
      await result.current.handleCommit();
    });

    expect(api.commitWorkbenchDraft).toHaveBeenCalledWith('draft_abc', 'Test Commit');
    expect(result.current.commitSuccess).not.toBeNull();
    expect(result.current.commitSuccess?.commitHash).toBe('sha256:abc123');
  });

  it('resets draft state on handleReset', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractResult);

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    // Proceed first
    await act(async () => {
      await result.current.handleProceed();
    });

    expect(result.current.draftId).toBe('draft_abc');
    expect(result.current.configLocked).toBe(true);

    // Reset
    act(() => {
      result.current.handleReset();
    });

    expect(result.current.draftId).toBeNull();
    expect(result.current.semanticPoints).toHaveLength(0);
    expect(result.current.configLocked).toBe(false);
    expect(result.current.extractionError).toBeNull();
  });

  it('re-extracts on handleReExtract after initial extraction', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractResult);

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    // First: proceed to create draft + extract
    await act(async () => {
      await result.current.handleProceed();
    });

    expect(result.current.semanticPoints).toHaveLength(2);

    // Modify mock to return different result
    const updatedExtractResult = {
      ready_points: [
        {
          id: 'sp_3',
          text: 'New extracted point',
          extraction_mode: 'llm_extracted' as const,
          status: 'auto_landed' as const,
          zone: 'ready' as const,
          evidence: [],
          position: 0,
          staged: true,
        },
      ],
      review_points: [],
      cursor: { cursors: {} },
      stats: {
        total_turns: 5,
        new_turns: 5,
        proposals: 1,
        auto_landed: 1,
        needs_review: 0,
        rejected: 0,
      },
    };
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(updatedExtractResult);

    // Act: re-extract
    await act(async () => {
      await result.current.handleReExtract();
    });

    // Assert: extractIncremental called again with same draftId
    expect(api.extractIncremental).toHaveBeenCalledTimes(2);
    expect(api.extractIncremental).toHaveBeenLastCalledWith('proj_1', 'conv_123', 'draft_abc');

    // Assert: semanticPoints updated to new result
    expect(result.current.semanticPoints).toHaveLength(1);
    expect(result.current.semanticPoints[0].text).toBe('New extracted point');
  });

  it('calls onUpdate with commitStatus committed after successful commit', async () => {
    (api.createWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockDraft);
    (api.extractIncremental as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractResult);
    (api.commitWorkbenchDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      commit: { hash: 'sha256:abc123' },
      leaf: null,
      draft_status: 'committed',
    });

    const node = makeNode();
    const { result } = renderHook(() =>
      usePendingCommitState({ node, onClose, onUpdate, projectId, onConvertDraft })
    );

    await waitForHook();

    await act(async () => {
      await result.current.handleProceed();
    });

    await act(async () => {
      await result.current.handleCommit();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        commitHash: 'sha256:abc123',
        commitStatus: 'committed',
        isGenerated: true,
      })
    );
  });
});
