// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PullRequestMergeReviewPanel } from '@/components/project/PullRequestMergeReviewPanel';

it('shows Schema-only changes and their combined contract without claiming they are applied', async () => {
  render(
    <PullRequestMergeReviewPanel
      projectId="p"
      pullRequest={{
        number: 1,
        mergeDraftId: 'draft',
        sourceBranch: 'dev',
        targetBranch: 'main',
        sourceCommitId: 'source',
        targetBaseCommitId: 'target',
      }}
      fetchMergeReview={vi.fn().mockResolvedValue({
        draft_id: 'draft',
        decision_revision: 0,
        decisions: null,
        source_commit_id: 'source',
        target_commit_id: 'target',
        merge_base_commit_id: 'base',
        nodes: [],
        schema_merge: {
          schema_hash: `sha256:${'a'.repeat(64)}`,
          root_key: 'candidate',
          changes: [
            {
              kind: 'ADD',
              path: 'nodes.requirements.slots.owner',
              summary: 'Contract path added.',
            },
          ],
        },
      })}
      saveMergeDecision={vi.fn()}
      onResolutionChange={vi.fn()}
      onRerun={vi.fn()}
      rerunning={false}
    />
  );
  const changes = await screen.findByRole('region', { name: 'Schema changes' });
  expect(within(changes).getByText('nodes.requirements.slots.owner')).toBeVisible();
  expect(within(changes).getByText('Combined Schema · not yet merged')).toBeVisible();
  expect(within(changes).getByTitle(`sha256:${'a'.repeat(64)}`)).toBeVisible();
});
