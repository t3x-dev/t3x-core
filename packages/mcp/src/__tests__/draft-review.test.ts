import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepareReview, getLatestReviewSnapshot, getReviewSnapshot, isApiBackend } = vi.hoisted(
  () => ({
    prepareReview: vi.fn(),
    getLatestReviewSnapshot: vi.fn(),
    getReviewSnapshot: vi.fn(),
    isApiBackend: vi.fn(),
  })
);

vi.mock('../backend.js', () => ({
  getApiClient: () => ({
    workspaces: { authoring: { prepareReview }, getLatestReviewSnapshot, getReviewSnapshot },
  }),
  isApiBackend,
}));

import { draftReviewHandler } from '../tools/draft-review.js';

const context = { project_id: 'p-1', workspace_id: 'w-1' };
const expected = {
  request_id: 'review-request-1',
  expected_workspace_revision: 3,
  expected_revision: 0,
  expected_ref_head: null,
};
const prepare = { ...context, action: 'prepare', ...expected };
const review = {
  snapshot_id: 'rvs_123',
  snapshot_digest: 'snapshot-digest',
  transition_id: 'transition-1',
  review_digest: 'review-digest',
  snapshot: { transition: { change: { operations: [] } } },
};
const transition = { checks: { replay: { status: 'pass' } } };
const prepared = {
  view: {
    transition_id: review.transition_id,
    precondition: { policy_digest: 'policy-digest', review_digest: review.review_digest },
    transition,
  },
  authoring: { workspaceId: 'w-1', compositionRevision: 0 },
  schemaReview: { base: { status: 'unbound' }, draft: { status: 'bound' } },
  reused: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
  prepareReview.mockResolvedValue(prepared);
  getLatestReviewSnapshot.mockResolvedValue(review);
  getReviewSnapshot.mockResolvedValue(review);
});

describe('Draft Review MCP tool', () => {
  it('prepares the exact saved Draft and reads back the fixed Review for that Transition', async () => {
    const result = await draftReviewHandler({
      ...prepare,
      actor: 'caller-supplied',
      reason: 'Review',
    });
    expect(result.isError).toBeUndefined();
    expect(prepareReview).toHaveBeenCalledWith('p-1', 'w-1', { ...expected, reason: 'Review' });
    expect(getLatestReviewSnapshot).toHaveBeenCalledWith('p-1', 'w-1', {
      transition_id: review.transition_id,
    });
    expect(getReviewSnapshot).toHaveBeenCalledWith('p-1', 'w-1', review.snapshot_id);
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      status: 'prepared',
      ...prepared,
      review,
    });
  });

  it('reads a specific snapshot without preparing or looking up the latest one', async () => {
    const result = await draftReviewHandler({
      ...context,
      action: 'read',
      snapshot_id: review.snapshot_id,
    });
    expect(JSON.parse(result.content[0]!.text)).toEqual(review);
    expect(prepareReview).not.toHaveBeenCalled();
    expect(getLatestReviewSnapshot).not.toHaveBeenCalled();
  });

  it('rejects an absent head expectation before preparing', async () => {
    const result = await draftReviewHandler({ ...prepare, expected_ref_head: undefined });
    expect(result.isError).toBe(true);
    expect(prepareReview).not.toHaveBeenCalled();
  });

  it('reports policy absence without treating the Transition as a fixed Review', async () => {
    prepareReview.mockResolvedValue({
      view: { ...prepared.view, precondition: { policy_digest: null } },
    });
    const result = await draftReviewHandler(prepare);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      error: {
        code: 'REVIEW_SNAPSHOT_POLICY_REQUIRED',
        details: { transition_id: review.transition_id, checks: transition.checks },
      },
    });
    expect(getLatestReviewSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a snapshot for a different Review precondition', async () => {
    getReviewSnapshot.mockResolvedValue({ ...review, review_digest: 'new-review-digest' });
    const result = await draftReviewHandler(prepare);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      error: { code: 'REVIEW_SNAPSHOT_STALE' },
    });
  });

  it('preserves API denial codes and does not read snapshots after a failed prepare', async () => {
    prepareReview.mockRejectedValue(new T3xApiError('FORBIDDEN', 'Missing Transition scope', 403));
    const result = await draftReviewHandler(prepare);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      error: { code: 'FORBIDDEN', status: 403 },
    });
    expect(getLatestReviewSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed on storage mode', async () => {
    isApiBackend.mockReturnValue(false);
    const result = await draftReviewHandler(prepare);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      error: { code: 'API_BACKEND_REQUIRED' },
    });
    expect(prepareReview).not.toHaveBeenCalled();
  });
});
