// @vitest-environment jsdom
/**
 * Canary tests for useDraftWorkspaceActions (draftWorkspaceStore migration).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/queries/workbenchDrafts', () => ({
  fetchWorkbenchDraft: vi.fn(),
}));

vi.mock('@/commands/drafts', () => ({
  updateWorkbenchDraft: vi.fn(),
  previewWorkbenchDraft: vi.fn(),
  commitWorkbenchDraft: vi.fn(),
  forkWorkbenchDraft: vi.fn(),
}));

import {
  commitWorkbenchDraft,
  previewWorkbenchDraft,
  updateWorkbenchDraft,
} from '@/commands/drafts';
import { useDraftWorkspaceActions } from '@/hooks/drafts/useDraftWorkspaceActions';
import { fetchWorkbenchDraft } from '@/queries/workbenchDrafts';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft_1',
    project_id: 'proj_1',
    title: 't',
    goal: null,
    nodes: [],
    constraints: [],
    instructions: null,
    preview_type: null,
    target_branch: 'main',
    revision: 1,
    status: 'editing',
    updated_at: '2026-04-13T00:00:00Z',
    preview_output: null,
    preview_generated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDraftWorkspaceStore.getState().reset();
});

afterEach(() => {
  cleanupRoots();
});

describe('useDraftWorkspaceActions.load', () => {
  it('seeds draft state via setLoadedDraft on success', async () => {
    vi.mocked(fetchWorkbenchDraft).mockResolvedValueOnce(makeDraft() as never);

    const { result } = renderHook(() => useDraftWorkspaceActions());
    await result.current.load('draft_1');
    await waitForHook();

    const state = useDraftWorkspaceStore.getState();
    expect(state.draftId).toBe('draft_1');
    expect(state.draft?.title).toBe('t');
    expect(state.loading).toBe(false);
  });

  it('records error on rejection', async () => {
    vi.mocked(fetchWorkbenchDraft).mockRejectedValueOnce(new Error('404'));
    const { result } = renderHook(() => useDraftWorkspaceActions());
    await result.current.load('draft_1');
    await waitForHook();

    const state = useDraftWorkspaceStore.getState();
    expect(state.error).toBe('404');
    expect(state.loading).toBe(false);
  });
});

describe('useDraftWorkspaceActions.save', () => {
  it('no-ops when not dirty', async () => {
    useDraftWorkspaceStore.setState({
      draftId: 'draft_1',
      draft: makeDraft() as never,
      isDirty: false,
    });
    const { result } = renderHook(() => useDraftWorkspaceActions());
    await result.current.save();
    expect(updateWorkbenchDraft).not.toHaveBeenCalled();
  });

  it('updates state on success', async () => {
    useDraftWorkspaceStore.setState({
      draftId: 'draft_1',
      draft: makeDraft() as never,
      isDirty: true,
    });
    vi.mocked(updateWorkbenchDraft).mockResolvedValueOnce(makeDraft({ revision: 2 }) as never);

    const { result } = renderHook(() => useDraftWorkspaceActions());
    await result.current.save();
    await waitForHook();

    const state = useDraftWorkspaceStore.getState();
    expect(state.saveStatus).toBe('saved');
    expect(state.isDirty).toBe(false);
    expect(state.draft?.revision).toBe(2);
  });
});

describe('useDraftWorkspaceActions.generatePreview', () => {
  it('writes preview output via setPreviewSucceeded', async () => {
    useDraftWorkspaceStore.setState({
      draftId: 'draft_1',
      draft: makeDraft() as never,
      isDirty: false,
    });
    vi.mocked(previewWorkbenchDraft).mockResolvedValueOnce({
      output: 'preview text',
      token_count: 42,
      model_used: 'haiku',
      cached: false,
    } as never);

    const { result } = renderHook(() => useDraftWorkspaceActions());
    await result.current.generatePreview();
    await waitForHook();

    const state = useDraftWorkspaceStore.getState();
    expect(state.previewOutput).toBe('preview text');
    expect(state.previewStatus).toBe('ready');
    expect(state.previewTokenCount).toBe(42);
  });
});

describe('useDraftWorkspaceActions.commit', () => {
  it('marks the draft as committed on success', async () => {
    useDraftWorkspaceStore.setState({
      draftId: 'draft_1',
      draft: makeDraft() as never,
      isDirty: false,
    });
    vi.mocked(commitWorkbenchDraft).mockResolvedValueOnce({
      commit: { hash: 'sha256:c' },
      leaf: null,
    } as never);

    const { result } = renderHook(() => useDraftWorkspaceActions());
    const out = await result.current.commit('msg');
    await waitForHook();

    expect(out.commit).toEqual({ hash: 'sha256:c' });
    expect(useDraftWorkspaceStore.getState().draft?.status).toBe('committed');
  });

  it('throws when no draft loaded', async () => {
    const { result } = renderHook(() => useDraftWorkspaceActions());
    await expect(result.current.commit('msg')).rejects.toThrow('No draft to commit');
  });
});
