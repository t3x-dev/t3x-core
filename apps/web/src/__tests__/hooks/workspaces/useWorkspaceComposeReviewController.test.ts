// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  prepare: vi.fn(),
  latest: vi.fn(),
  decide: vi.fn(),
  legacy: vi.fn(),
  pins: vi.fn(),
}));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    workspaces: {
      authoring: { read: mocks.read, prepareReview: mocks.prepare },
      getLatestReviewSnapshot: mocks.latest,
    },
  }),
}));
vi.mock('@/hooks/pins/usePinsCrud', () => ({ usePinsCrud: () => ({ fetch: mocks.pins }) }));
vi.mock('@/hooks/materials/useMaterialUpload', () => ({ useMaterialUpload: () => ({}) }));
vi.mock('@/queries/workspaces', () => ({
  decideWorkspaceTransition: mocks.decide,
  reviewWorkspaceTransition: mocks.legacy,
}));

function candidate(revision = 2) {
  return {
    ...getProjectWorkspaceStarterCandidate('proj_1'),
    revision,
    authoringLedger: { actions: [] },
  };
}
const document = {
  domain: 't3x.dev/semantic-content',
  version: 1,
  content: { trees: [], relations: [] },
};
const schemaReview = {
  schema: 't3x.application/workspace-schema-review/v1',
  base: { status: 'unbound' },
  actionCount: 2,
};
const prepared = {
  view: {
    transition_id: 'trn_review',
    precondition: { workspace_revision: 2, ref_head: null },
    transition: {},
  },
  schemaReview,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    base: {},
    current: document,
    selected: {
      before: {},
      after: {
        ...document,
        content: {
          trees: [{ key: 'selected-action-only', slots: {}, children: [] }],
          relations: [],
        },
      },
      cards: [],
    },
    workspaceRevision: 2,
    compositionRevision: 2,
    basis: { refHead: null },
    netDiff: [],
  });
  mocks.prepare.mockResolvedValue(prepared);
  mocks.latest.mockResolvedValue({ snapshot: { snapshotId: 'rvs_review' } });
});
it('freezes the complete application Review and invalidates it on a same-Workspace revision change', async () => {
  const { result, rerender } = renderHook(
    ({ workspace }) => useWorkspaceComposeReviewController({ candidate: workspace }),
    { initialProps: { workspace: candidate() } }
  );
  await act(async () => {
    await result.current.prepareReview();
  });
  expect(result.current.review.schemaReview).toEqual(schemaReview);
  expect(result.current.review.content?.trees).toEqual(document.content.trees);
  rerender({ workspace: candidate(3) });
  expect(result.current.review.transitionId).toBeNull();
  expect(result.current.notice).toBe('Draft changed; prepare a complete Review again.');
  await act(async () => {
    await result.current.decide('accepted');
  });
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('does not announce an obsolete Review when an unreviewed Draft revision changes', () => {
  const { result, rerender } = renderHook(
    ({ workspace }) => useWorkspaceComposeReviewController({ candidate: workspace }),
    { initialProps: { workspace: candidate() } }
  );
  rerender({ workspace: candidate(3) });
  expect(result.current.candidate.revision).toBe(3);
  expect(result.current.review.transitionId).toBeNull();
  expect(result.current.notice).toBeNull();
});
it('discards a delayed snapshot after a concurrent edit of the same Workspace', async () => {
  let resolve!: (value: unknown) => void;
  mocks.latest.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { result, rerender } = renderHook(
    ({ workspace }) => useWorkspaceComposeReviewController({ candidate: workspace }),
    { initialProps: { workspace: candidate() } }
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.prepareReview();
  });
  await waitFor(() => expect(mocks.latest).toHaveBeenCalled());
  rerender({ workspace: candidate(3) });
  await act(async () => {
    resolve({ snapshot: { snapshotId: 'obsolete' } });
    await pending;
  });
  expect(result.current.review.transitionId).toBeNull();
});
it('does not silently fall back to legacy Studio-style Review when the managed Draft read fails', async () => {
  mocks.read.mockRejectedValueOnce(new Error('Authoring unavailable'));
  const fallback = vi.fn();
  const workspace = candidate();
  const { result } = renderHook(() =>
    useWorkspaceComposeReviewController({ candidate: workspace, onPrepareDraft: fallback })
  );
  await act(async () => {
    await result.current.prepareReview();
  });
  expect(fallback).not.toHaveBeenCalled();
  expect(mocks.legacy).not.toHaveBeenCalled();
  expect(result.current.error).toContain('Authoring unavailable');
});
