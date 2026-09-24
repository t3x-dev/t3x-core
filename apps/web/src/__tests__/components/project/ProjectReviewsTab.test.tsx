// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

const pullRequestApi = vi.hoisted(() => ({
  closePullRequest: vi.fn(),
  createPullRequest: vi.fn(),
  fetchCompareCandidates: vi.fn(),
  fetchPullRequest: vi.fn(),
  fetchPullRequests: vi.fn(),
  mergePullRequest: vi.fn(),
  rerunReadiness: vi.fn(),
}));

vi.mock('@/hooks/projects/useProjectPullRequestsApi', () => ({
  useProjectPullRequestsApi: () => pullRequestApi,
}));

import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';

const realCompareCandidate = {
  id: 'compare_real_feature',
  branch: 'real/feature',
  base_branch: 'main',
  title: 'Real feature',
  description: 'A comparison loaded from the project API.',
  head_commit_id: 'sha256:source-preview',
  base_commit_id: 'sha256:target-preview',
  updated_at: '2026-07-22T00:00:00.000Z',
  ahead_by: 1,
  behind_by: 0,
  yops_changes: 1,
  changed_nodes: 1,
  output_impacts: 0,
  source_refs: 0,
  schema: 't3x/commit/v2',
  status: 'ready' as const,
  status_label: 'Available',
  open_pull_request_number: null,
};

const behindCompareCandidate = {
  ...realCompareCandidate,
  id: 'compare_behind_feature',
  branch: 'feature/behind',
  title: 'Behind feature',
  description: 'A committed branch that is behind the selected base.',
  head_commit_id: 'sha256:behind-preview',
  ahead_by: 0,
  behind_by: 2,
  status: 'no_changes' as const,
  status_label: 'Behind base',
};

const emptyBaseCompareCandidate = {
  ...realCompareCandidate,
  id: 'compare_first_feature_commit',
  branch: 'feature/first-commit',
  title: 'First feature commit',
  description: 'A committed source branch waiting for a base commit.',
  head_commit_id: 'sha256:first-feature-commit',
  base_commit_id: null,
  status: 'base_empty' as const,
  status_label: 'Base has no commit',
};

beforeEach(() => {
  vi.clearAllMocks();
  pullRequestApi.fetchPullRequests.mockResolvedValue({
    pull_requests: [],
    counts: { active: 0, merged: 0 },
  });
  pullRequestApi.fetchCompareCandidates.mockResolvedValue({
    base_branches: ['main', 'release/2026-07'],
    compare_branches: [realCompareCandidate],
  });
  pullRequestApi.createPullRequest.mockReturnValue(new Promise(() => {}));
});

describe('ProjectReviewsTab', () => {
  it('opens a linked PR number from Community against the real project API', async () => {
    const linkedRequest = {
      id: 'pr-7',
      number: 7,
      project_id: 'proj_real',
      title: 'Linked review',
      description: '',
      source_branch: 'feature',
      target_branch: 'main',
      source_commit_id: 'source',
      target_base_commit_id: 'base',
      merge_draft_id: null,
      merge_commit_id: null,
      status: 'open',
      author_id: 'user-1',
      steward_id: null,
      review_owner_id: null,
      workspace_id: null,
      release_lane_id: null,
      linked_work: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      merged_at: null,
      closed_at: null,
    };
    pullRequestApi.fetchPullRequests.mockResolvedValue({
      pull_requests: [],
      counts: { active: 0, merged: 0 },
    });
    pullRequestApi.fetchPullRequest.mockResolvedValue({
      ...linkedRequest,
      activity: [],
      checks: [],
      diff_summary: { changed_nodes: 0, yops_operations: 0, output_impacts: 0, source_refs: 0 },
    });
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={7} />);

    await waitFor(() =>
      expect(pullRequestApi.fetchPullRequest).toHaveBeenCalledWith('proj_real', 7)
    );
    expect(await screen.findByText('Linked review')).toBeInTheDocument();
  });
  it('renders the pull request list with the State page visual constitution', () => {
    render(<ProjectReviewsTab />);

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create PR' })).toHaveTextContent('New pull request');
    expect(screen.getByPlaceholderText('Search by title or branch...')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1 Merged' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '0 Closed' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v3 rollout')).toBeInTheDocument();
    expect(screen.getByText('Audience handoff updates')).toBeInTheDocument();
    expect(screen.getByText('ready to merge')).toBeInTheDocument();
    expect(screen.getByText('needs decision')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Owners/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Release lane/ })).not.toBeInTheDocument();
  });

  it('opens a compare-first create flow with available PR branches', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    expect(screen.getByRole('heading', { name: 'New pull request' })).toBeInTheDocument();
    expect(screen.getByText('Ready to open')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Source branch' })).toHaveTextContent(
      'outputs/bundle-refresh'
    );
    expect(screen.getByRole('combobox', { name: 'Base branch' })).toHaveTextContent('main');
    expect(screen.getByLabelText('Title')).toHaveValue('Output bundle refresh');
    expect(screen.getByText('YOps changes')).toBeInTheDocument();
    expect(screen.getByText('Source commit')).toBeInTheDocument();
    expect(screen.getByText('Base commit')).toBeInTheDocument();
    expect(screen.getByText(/Showing key changes from/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+112/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toHaveAttribute(
      'data-variant',
      'commit'
    );
  });

  it('creates a project PR from the exact commit snapshot shown by compare', async () => {
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(await screen.findByDisplayValue('Real feature')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));

    expect(pullRequestApi.createPullRequest).toHaveBeenCalledWith('proj_real', {
      description: expect.stringContaining('A comparison loaded from the project API.'),
      expected_source_commit_id: 'sha256:source-preview',
      expected_target_commit_id: 'sha256:target-preview',
      source_branch: 'real/feature',
      target_branch: 'main',
      title: 'Real feature',
    });
  });

  it('defaults the base to main while keeping every registered branch selectable', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main', 'release/2026-07', 'feature/prd-audience'],
      compare_branches: [realCompareCandidate],
    });
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    const baseSelect = await screen.findByRole('combobox', { name: 'Base branch' });
    await waitFor(() => {
      expect(baseSelect).toHaveTextContent('main');
    });

    fireEvent.keyDown(baseSelect, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'main' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'release/2026-07' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'feature/prd-audience' })).toBeInTheDocument();
  });

  it('refreshes branch comparisons when a workspace commit is created', async () => {
    pullRequestApi.fetchCompareCandidates
      .mockResolvedValueOnce({ base_branches: ['main'], compare_branches: [] })
      .mockResolvedValue({
        base_branches: ['main'],
        compare_branches: [realCompareCandidate],
      });
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(
      await screen.findByText('No other committed branches can be compared with this base.')
    ).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent('t3x:commit-created', {
        detail: {
          type: 'commit.created',
          projectId: 'proj_real',
          branch: 'real/feature',
          payload: { hash: 'sha256:source-preview', branch: 'real/feature' },
        },
      })
    );

    expect(await screen.findByDisplayValue('Real feature')).toBeInTheDocument();
    expect(pullRequestApi.fetchCompareCandidates).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Refresh branch comparisons' })).toBeInTheDocument();
  });

  it('keeps committed but unavailable branches visible with their reason', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main'],
      compare_branches: [realCompareCandidate, behindCompareCandidate],
    });
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Real feature');
    });
    const sourceSelect = screen.getByRole('combobox', { name: 'Source branch' });
    fireEvent.keyDown(sourceSelect, { key: 'ArrowDown' });
    const behindOption = await screen.findByRole('option', { name: /feature\/behind/i });
    expect(behindOption).toHaveTextContent('Behind base');

    fireEvent.click(behindOption);
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeDisabled();
    expect(screen.getAllByText(/Behind base/).length).toBeGreaterThan(0);
  });

  it('shows committed source branches even when the selected base has no commit', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main', 'feature/first-commit'],
      compare_branches: [emptyBaseCompareCandidate],
    });
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    const sourceSelect = await screen.findByRole('combobox', { name: 'Source branch' });
    await waitFor(() => {
      expect(sourceSelect).toHaveTextContent('feature/first-commit');
    });
    fireEvent.keyDown(sourceSelect, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: /feature\/first-commit/i })).toHaveTextContent(
      'Base has no commit'
    );
    fireEvent.keyDown(sourceSelect, { key: 'Escape' });
    expect(screen.getByText('No commit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeDisabled();
  });

  it('disables creation while a newly selected base is being compared', async () => {
    pullRequestApi.fetchCompareCandidates.mockImplementation((_projectId: string, base: string) =>
      base === 'main'
        ? Promise.resolve({
            base_branches: ['main', 'release/2026-07'],
            compare_branches: [realCompareCandidate],
          })
        : new Promise(() => {})
    );
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(await screen.findByDisplayValue('Real feature')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Base branch' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'release/2026-07' }));

    await waitFor(() => {
      expect(pullRequestApi.fetchCompareCandidates).toHaveBeenLastCalledWith(
        'proj_real',
        'release/2026-07'
      );
    });
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeDisabled();
    expect(screen.getByText('Loading branch comparisons...')).toBeInTheDocument();
  });

  it('aligns the form to the first committed base when the default main branch is empty', async () => {
    pullRequestApi.fetchCompareCandidates.mockImplementation((_projectId: string, base: string) =>
      base === 'main'
        ? Promise.resolve({
            base_branches: ['feature/prd-audience'],
            compare_branches: [],
          })
        : Promise.resolve({
            base_branches: ['feature/prd-audience'],
            compare_branches: [],
          })
    );
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    await waitFor(() => {
      expect(pullRequestApi.fetchCompareCandidates).toHaveBeenLastCalledWith(
        'proj_real',
        'feature/prd-audience'
      );
    });
    expect(screen.getByRole('combobox', { name: 'Base branch' })).toHaveTextContent(
      'feature/prd-audience'
    );
    expect(
      screen.getByText('No other committed branches can be compared with this base.')
    ).toBeInTheDocument();
  });

  it('returns to the open PR list after creation and highlights the new PR', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(screen.getByRole('heading', { name: 'New pull request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Output bundle refresh');
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '4 Open' })).toBeInTheDocument();
    expect(screen.getByText('Output bundle refresh')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('checks queued')).toBeInTheDocument();
    expect(screen.queryByText('Merge simulation')).not.toBeInTheDocument();
  });

  it('opens existing PRs into a structured PR detail skeleton', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Changes')).toBeInTheDocument();
    expect(screen.getByText('release_plan')).toBeInTheDocument();
    expect(screen.getByText('Merged result preview')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Merge readiness')).toBeInTheDocument();
    expect(screen.getByText('Branch relationship')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View all checks/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Changes'));
    expect(screen.getByText('changedNodes')).toBeInTheDocument();
    expect(screen.getByText('Why / Source')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Checks'));
    expect(screen.getByText('Source commit')).toBeInTheDocument();
    expect(screen.getByText('Merge simulation')).toBeInTheDocument();
  });

  it('moves a newly opened PR to ready after rerunning readiness', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(screen.getByRole('heading', { name: 'New pull request' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);

    expect(screen.getByText('checks queued')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rerun readiness' }));

    expect(screen.getByText('ready to merge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
  });

  it('moves a merged PR into the closed list after merge succeeds', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Merge PR' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Merged' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getAllByText('merged').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Release note cleanup').closest('button')!);
    expect(screen.getByText('merged')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
  });

  it('closes an open PR without merging and moves it into the closed list', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close PR' }));

    expect(screen.getByText(/Close without merging/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1 Closed' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getAllByText('closed').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Release note cleanup').closest('button')!);
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
  });
});
