// @vitest-environment jsdom
import { T3xApiError } from '@t3x-dev/api-client';
import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSchemaReviewFlow } from '@/hooks/schemas/useSchemaReviewFlow';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  prepare: vi.fn(),
  latest: vi.fn(),
}));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    workspaces: {
      authoring: { read: mocks.read, prepareReview: mocks.prepare },
      getLatestReviewSnapshot: mocks.latest,
    },
  }),
}));
vi.mock('@/infrastructure/schemaStudio', () => ({
  applySchemaContentPreparation: vi.fn(),
  previewSchemaContentPreparation: vi.fn(),
  previewStudioSelection: vi.fn(),
  readStudioSchemaEditCandidate: vi.fn(),
}));

function draft() {
  return {
    workspaceRevision: 7,
    compositionRevision: 3,
    basis: { refName: 'main', refHead: 'head-1', baseDigest: 'base-1' },
    hasChanges: true,
  };
}
function snapshot(current = draft(), transitionId = 'trn-1', outcome?: string) {
  return {
    schema_review: { schema: 't3x.application/workspace-schema-review/v1' },
    snapshot: {
      projectId: 'p',
      workspaceId: 'w',
      transitionId,
      snapshotId: `snapshot-${current.workspaceRevision}`,
      review: {
        precondition: {
          workspaceRevision: current.workspaceRevision,
          refName: current.basis.refName,
          refHead: current.basis.refHead,
        },
      },
      transition: { decision: { outcome } },
    },
  };
}
function notFound() {
  return new T3xApiError('NOT_FOUND', 'ReviewSnapshot not found', 404);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(draft());
  mocks.prepare.mockResolvedValue({ view: { transition_id: 'trn-1' } });
  mocks.latest.mockImplementation(async (_project, _workspace, query) => {
    if (query?.transition_id) return snapshot();
    throw notFound();
  });
});

it('reuses the complete preparation request after an uncertain network failure', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('Connection lost'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('Connection lost');
  const firstRequest = mocks.prepare.mock.calls[0]![2];
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-7');
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.prepare.mock.calls[1]![2]).toEqual(firstRequest);
  expect(firstRequest).toEqual({
    request_id: expect.any(String),
    expected_workspace_revision: 7,
    expected_revision: 3,
    expected_ref_head: 'head-1',
    reason: 'Review Schema changes and the complete Workspace Draft.',
  });
});

it('only reloads the prepared Transition when its snapshot read failed', async () => {
  mocks.latest.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(new Error('Read failed'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('Read failed');
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-7');
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.latest.mock.calls).toEqual([
    ['p', 'w', undefined],
    ['p', 'w', { transition_id: 'trn-1' }],
    ['p', 'w', { transition_id: 'trn-1' }],
  ]);
});

it.each([
  ['Workspace revision', (value: ReturnType<typeof draft>) => ({ ...value, workspaceRevision: 8 })],
  [
    'composition revision',
    (value: ReturnType<typeof draft>) => ({ ...value, compositionRevision: 4 }),
  ],
  [
    'branch',
    (value: ReturnType<typeof draft>) => ({ ...value, basis: { ...value.basis, refName: 'dev' } }),
  ],
  [
    'head',
    (value: ReturnType<typeof draft>) => ({
      ...value,
      basis: { ...value.basis, refHead: 'head-2' },
    }),
  ],
  [
    'Base',
    (value: ReturnType<typeof draft>) => ({
      ...value,
      basis: { ...value.basis, baseDigest: 'base-2' },
    }),
  ],
])('starts a new request when the %s changes after a failed attempt', async (_label, change) => {
  const changed = change(draft());
  mocks.read.mockResolvedValueOnce(draft()).mockResolvedValueOnce(changed);
  mocks.prepare.mockRejectedValueOnce(new Error('Connection lost'));
  mocks.latest.mockImplementation(async (_project, _workspace, query) => {
    if (query?.transition_id) return snapshot(changed);
    throw notFound();
  });
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('Connection lost');
  await result.current.review('w');
  const firstRequest = mocks.prepare.mock.calls[0]![2];
  const secondRequest = mocks.prepare.mock.calls[1]![2];
  expect(secondRequest.request_id).not.toBe(firstRequest.request_id);
  expect(secondRequest).toMatchObject({
    expected_workspace_revision: changed.workspaceRevision,
    expected_revision: changed.compositionRevision,
    expected_ref_head: changed.basis.refHead,
  });
});

it('opens an already rejected exact revision without preparing it again', async () => {
  mocks.latest.mockResolvedValueOnce(snapshot(draft(), 'trn-rejected', 'rejected'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-7');
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('prepares a complete Schema Review instead of reusing an unrelated snapshot', async () => {
  mocks.latest.mockResolvedValueOnce({ ...snapshot(), schema_review: null });
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await result.current.review('w');
  expect(mocks.prepare).toHaveBeenCalledOnce();
});

it('does not recover an earlier Transition after the Draft revision changes', async () => {
  const changed = { ...draft(), workspaceRevision: 8, compositionRevision: 4 };
  mocks.read.mockResolvedValueOnce(draft()).mockResolvedValueOnce(changed);
  mocks.prepare
    .mockResolvedValueOnce({ view: { transition_id: 'trn-1' } })
    .mockResolvedValueOnce({ view: { transition_id: 'trn-2' } });
  mocks.latest
    .mockRejectedValueOnce(notFound())
    .mockRejectedValueOnce(new Error('Read failed'))
    .mockRejectedValueOnce(notFound())
    .mockResolvedValueOnce(snapshot(changed, 'trn-2'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('Read failed');
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-8');
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.prepare.mock.calls[1]![2].request_id).not.toBe(
    mocks.prepare.mock.calls[0]![2].request_id
  );
  expect(mocks.latest).toHaveBeenLastCalledWith('p', 'w', { transition_id: 'trn-2' });
});

it.each([
  ['Workspace revision', { ...draft(), workspaceRevision: 6 }],
  ['branch', { ...draft(), basis: { ...draft().basis, refName: 'other' } }],
  ['head', { ...draft(), basis: { ...draft().basis, refHead: 'older-head' } }],
])('does not reuse a snapshot with a different %s', async (_label, previous) => {
  mocks.latest.mockResolvedValueOnce(snapshot(previous, 'trn-old'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-7');
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.prepare.mock.calls[0]![2].expected_workspace_revision).toBe(7);
});

it('does not substitute a stale snapshot after preparation succeeded', async () => {
  mocks.latest.mockRejectedValueOnce(notFound()).mockResolvedValueOnce(
    snapshot({
      ...draft(),
      workspaceRevision: 6,
    })
  );
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('unavailable for this Draft');
  await expect(result.current.review('w')).resolves.toContain('reviewSnapshot=snapshot-7');
  expect(mocks.prepare).toHaveBeenCalledOnce();
});

it('does not create a new Review when the existing Review could not be read', async () => {
  mocks.latest.mockRejectedValueOnce(new Error('Review service unavailable'));
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  await expect(result.current.review('w')).rejects.toThrow('Review service unavailable');
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('coalesces concurrent preparation clicks for the same Workspace', async () => {
  const { result } = renderHook(() => useSchemaReviewFlow('p'));
  const first = result.current.review('w');
  const second = result.current.review('w');
  expect(second).toBe(first);
  await first;
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.prepare).toHaveBeenCalledOnce();
});

it('does not continue preparing after the editor is unmounted', async () => {
  let finishRead!: (value: ReturnType<typeof draft>) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      })
  );
  const { result, unmount } = renderHook(() => useSchemaReviewFlow('p'));
  const request = result.current.review('w');
  const rejected = expect(request).rejects.toThrow('context changed');
  unmount();
  finishRead(draft());
  await rejected;
  expect(mocks.latest).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});
