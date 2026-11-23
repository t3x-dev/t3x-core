import type { AnyDB } from '@t3x-dev/storage';
import { expect, it, vi } from 'vitest';
import { readCommittedSchemaBinding, unboundWorkspaceSchema } from '../lib/workspace-schema-review';

const stores = vi.hoisted(() => ({
  getVerifiedTransitionCommitGraph: vi.fn(),
  getRepositoryDecisionAuditByDigest: vi.fn(),
  getTransitionViewForCommit: vi.fn(),
  findTransitionCommitReceipt: vi.fn(),
  resolveTransitionProposalGraph: vi.fn(),
}));

vi.mock('@t3x-dev/storage', async (original) => ({
  ...(await original<typeof import('@t3x-dev/storage')>()),
  ...stores,
}));

vi.mock('@t3x-dev/core', async (original) => ({
  ...(await original<typeof import('@t3x-dev/core')>()),
  describeTransitionObject: (object: { digest: string }) => ({ digest: object.digest }),
}));

it('requires explicit immutable evidence before reporting a historical Commit as unbound', async () => {
  const snapshot = unboundWorkspaceSchema();
  const review = {
    schema: 't3x.application/workspace-schema-review/v1',
    base: snapshot,
    draft: snapshot,
    changes: [],
    actionCount: 1,
    baseContent: {},
    draftContent: { updated: true },
  };
  stores.getVerifiedTransitionCommitGraph.mockResolvedValue({
    commit: { decision: { digest: 'decision' } },
    proposal: { digest: 'proposal' },
    effect: { digest: 'effect' },
  });
  stores.getRepositoryDecisionAuditByDigest.mockResolvedValue({ refName: 'original-ref' });
  stores.getTransitionViewForCommit.mockResolvedValue({
    mode: 'transition',
    checks: { validation: { runs: [] } },
  });
  stores.findTransitionCommitReceipt.mockResolvedValue({ transitionId: 'transition' });
  const graph = {
    membership: { proposalDigest: 'proposal', effectDigest: 'effect' },
    preparation: { canonicalJson: JSON.stringify({ schemaReview: review }) },
  };
  stores.resolveTransitionProposalGraph
    .mockResolvedValueOnce({ ...graph, preparation: null })
    .mockResolvedValueOnce({ ...graph, preparation: null })
    .mockResolvedValueOnce(graph)
    .mockResolvedValueOnce({
      ...graph,
      membership: { ...graph.membership, effectDigest: 'other' },
    });
  const read = () => readCommittedSchemaBinding({} as AnyDB, 'project', 'historical-commit');

  await expect(read()).resolves.toMatchObject({ status: 'unknown' });
  await expect(read()).resolves.toEqual(snapshot);
  await expect(read()).resolves.toMatchObject({ status: 'unknown' });
  expect(stores.getTransitionViewForCommit).toHaveBeenCalledWith(
    {},
    {
      projectId: 'project',
      refName: 'original-ref',
      commitId: 'historical-commit',
    }
  );
});
