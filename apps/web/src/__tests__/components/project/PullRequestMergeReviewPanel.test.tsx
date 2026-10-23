// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('keeps Schema choices editable and blocks publication until the exact edits are saved and rechecked', async () => {
  const path = 'nodes/requirements/slots/title/maxLength';
  const save = vi.fn().mockResolvedValue(5);
  const rerun = vi.fn();
  const resolution = vi.fn();
  render(
    <PullRequestMergeReviewPanel
      projectId="p"
      pullRequest={{
        number: 2,
        mergeDraftId: 'draft-2',
        sourceBranch: 'dev',
        targetBranch: 'main',
        sourceCommitId: 's',
        targetBaseCommitId: 't',
      }}
      fetchMergeReview={vi.fn().mockResolvedValue({
        draft_id: 'draft-2',
        decision_revision: 4,
        decisions: null,
        source_commit_id: 's',
        target_commit_id: 't',
        merge_base_commit_id: 'b',
        nodes: [],
        schema_merge: {
          schema_hash: 'hash',
          root_key: 'candidate',
          changes: [],
          conflicts: [{ path, base: 10, source: 30, target: 40 }],
          unresolved: [path],
          issues: [],
        },
      })}
      saveMergeDecision={save}
      onResolutionChange={resolution}
      onRerun={rerun}
      rerunning={false}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Use dev', exact: true }));
  await waitFor(() => expect(resolution.mock.lastCall?.[1].unresolved).toBeGreaterThan(0));
  fireEvent.change(screen.getByRole('textbox', { name: `Custom Schema value ${path}` }), {
    target: { value: '{bad' },
  });
  expect(screen.getByRole('button', { name: 'Save & recheck Schema and content' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: `Custom Schema value ${path}` }), {
    target: { value: '20' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save & recheck Schema and content' }));
  await waitFor(() => expect(rerun).toHaveBeenCalledTimes(1));
  expect(save.mock.calls.at(-1)).toEqual([
    'draft-2',
    expect.objectContaining({
      schemaResolution: { choices: { [path]: { value: 20 } }, commands: [] },
    }),
    4,
  ]);
  expect(resolution.mock.lastCall?.[0]).toBeNull();
});

it('restores concrete migration edits after reload and does not rerun when saving loses its revision race', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Reload the draft before saving.'));
  const rerun = vi.fn();
  render(
    <PullRequestMergeReviewPanel
      projectId="p"
      pullRequest={{
        number: 3,
        mergeDraftId: 'draft-3',
        sourceBranch: 'dev',
        targetBranch: 'main',
        sourceCommitId: 's',
        targetBaseCommitId: 't',
      }}
      fetchMergeReview={vi.fn().mockResolvedValue({
        draft_id: 'draft-3',
        decision_revision: 8,
        decisions: {
          conflictResolutions: {},
          keepFromSource: [],
          keepFromTarget: [],
          keepRelationsFromSource: true,
          keepRelationsFromTarget: true,
          schemaResolution: {
            choices: {},
            commands: [{ kind: 'set', path: 'content/title', value: 'Preserved' }],
          },
        },
        nodes: [],
        schema_merge: {
          schema_hash: 'hash',
          root_key: 'candidate',
          changes: [],
          conflicts: [],
          unresolved: [],
          issues: [{ path: 'title', message: 'Too long' }],
        },
      })}
      saveMergeDecision={save}
      onResolutionChange={vi.fn()}
      onRerun={rerun}
      rerunning={false}
    />
  );
  expect(await screen.findByDisplayValue('Preserved')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save & recheck Schema and content' }));
  await screen.findByText('Reload the draft before saving.');
  expect(rerun).not.toHaveBeenCalled();
});
