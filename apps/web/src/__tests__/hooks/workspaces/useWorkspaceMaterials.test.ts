// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { usePinsStore } from '@/store/pinsStore';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  fetchPins: vi.fn(),
  deleteMaterial: vi.fn(),
}));
vi.mock('@/infrastructure/materials', () => ({
  uploadDocumentMaterial: mocks.upload,
  deleteMaterial: mocks.deleteMaterial,
}));
vi.mock('@/commands/pins', () => ({
  createPin: mocks.createPin,
  deletePin: mocks.deletePin,
  updatePinAssertions: vi.fn(),
}));
vi.mock('@/queries/pins', () => ({ fetchPins: mocks.fetchPins }));
vi.mock('@/queries/providerStatus', () => ({
  fetchLocalProviderStatus: () => {
    throw new Error('No AI');
  },
}));
vi.mock('@/queries/llm', () => ({
  fetchAvailableModels: () => {
    throw new Error('No AI');
  },
}));
const material = {
  id: 'material-1',
  title: 'Brief',
  filename: 'brief.md',
  source_type: 'document',
  metadata: {},
  content_excerpt: 'requirements',
  token_estimate: 3,
};
const pin = { id: 'pin-1', project_id: 'p', type: 'import', ref_id: 'material-1' };
beforeEach(() => {
  vi.resetAllMocks();
  usePinsStore.setState({
    pins: [],
    initialized: false,
    currentProjectId: null,
    loading: false,
    error: null,
  });
  mocks.fetchPins.mockResolvedValue([]);
  mocks.upload.mockResolvedValue(material);
  mocks.createPin.mockResolvedValue(pin);
  mocks.deletePin.mockResolvedValue(undefined);
});
it('uploads without AI, restores saved selection, and unselects only the reference', async () => {
  let saved = getProjectWorkspaceStarterCandidate('p', []);
  const onDraftCommand = vi.fn(async (candidate: WorkspaceCandidate) => {
    saved = { ...candidate, revision: (candidate.revision ?? 0) + 1 };
    return saved;
  });
  const first = renderHook(() =>
    useWorkspaceComposeReviewController({ candidate: saved, onDraftCommand })
  );
  await waitFor(() => expect(usePinsStore.getState().initialized).toBe(true));
  await act(async () => {
    expect(await first.result.current.uploadFile(new File(['requirements'], 'brief.md'))).toBe(
      true
    );
  });
  expect(first.result.current.materialSources).toEqual([
    expect.objectContaining({ materialId: 'material-1', included: true, title: 'Brief' }),
  ]);
  expect(saved.sourceBundle[0]?.materialId).toBe('material-1');
  expect(first.result.current.notice).toContain('added as source evidence');
  first.unmount();
  usePinsStore.setState({ pins: [], initialized: false, currentProjectId: null });
  mocks.fetchPins.mockResolvedValue([pin]);
  const second = renderHook(() =>
    useWorkspaceComposeReviewController({ candidate: saved, onDraftCommand })
  );
  await waitFor(() => expect(second.result.current.materialSources[0]?.included).toBe(true));
  await act(async () => {
    await second.result.current.toggleMaterialSource('material-1');
  });
  expect(mocks.deletePin).toHaveBeenCalledWith('pin-1');
  expect(mocks.deleteMaterial).not.toHaveBeenCalled();
  expect(saved.sourceBundle[0]?.materialId).toBe('material-1');
  expect(second.result.current.materialSources[0]?.included).toBe(false);
});
it('reports an upload failure without a false success or reference', async () => {
  mocks.upload.mockRejectedValue(new Error('Upload unavailable'));
  const candidate = getProjectWorkspaceStarterCandidate('p', []);
  const { result } = renderHook(() => useWorkspaceComposeReviewController({ candidate }));
  await act(async () => {
    expect(await result.current.uploadFile(new File(['notes'], 'brief.md'))).toBe(false);
  });
  expect(result.current.error).toContain('Upload unavailable');
  expect(result.current.notice).toBeNull();
  expect(mocks.createPin).not.toHaveBeenCalled();
});

it('distinguishes a saved material from failed Workspace inclusion', async () => {
  mocks.createPin.mockRejectedValue(new Error('Permission denied'));
  const candidate = getProjectWorkspaceStarterCandidate('p', []);
  const { result } = renderHook(() => useWorkspaceComposeReviewController({ candidate }));
  await act(async () => {
    expect(await result.current.uploadFile(new File(['notes'], 'brief.md'))).toBe(false);
  });
  expect(result.current.error).toContain('Material saved, but Workspace inclusion failed.');
  expect(result.current.notice).toBeNull();
  expect(mocks.deleteMaterial).not.toHaveBeenCalled();
});
