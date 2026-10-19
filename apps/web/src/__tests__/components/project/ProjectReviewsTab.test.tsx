// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

const pullRequestApi = vi.hoisted(() => ({
  closePullRequest: vi.fn(),
  createPullRequest: vi.fn(),
  fetchCompareCandidates: vi.fn(),
  fetchMergeReview: vi.fn(),
  fetchPullRequest: vi.fn(),
  fetchPullRequests: vi.fn(),
  mergePullRequest: vi.fn(),
  rerunReadiness: vi.fn(),
  saveMergeDecision: vi.fn(),
}));

vi.mock('@/hooks/projects/useProjectPullRequestsApi', () => ({
  useProjectPullRequestsApi: () => pullRequestApi,
}));

const changePreview = vi.hoisted(() =>
  vi.fn(() => ({ changes: undefined, error: null, loading: false }))
);
vi.mock('@/hooks/projects/usePullRequestChangePreview', () => ({
  usePullRequestChangePreview: changePreview,
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
  changePreview.mockReturnValue({ changes: undefined, error: null, loading: false });
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

afterEach(() => vi.unstubAllGlobals());

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
    expect(screen.getByPlaceholderText('Search title, branch, or #number')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1 Merged' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '0 Closed' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v3 rollout')).toBeInTheDocument();
    expect(screen.getByText('Audience handoff updates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View PR #17:/ })).toHaveTextContent(
      'Ready to merge'
    );
    expect(screen.getByRole('button', { name: /View PR #18:/ })).toHaveTextContent(
      'Needs decision'
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Owners/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Release lane/ })).not.toBeInTheDocument();
  });

  it('keeps a number search across groups and clears only the Open status filter', () => {
    render(<ProjectReviewsTab />);
    const search = screen.getByRole('searchbox', { name: 'Search pull requests' });
    fireEvent.change(search, { target: { value: '#14' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pull request status' }), {
      target: { value: 'ready' },
    });
    expect(screen.getByRole('heading', { name: 'No matching pull requests' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '1 Merged' }));
    expect(search).toHaveValue('#14');
    expect(screen.queryByRole('combobox', { name: 'Pull request status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View PR #14:/ })).toBeInTheDocument();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '3 Open' }));
    expect(screen.getByRole('combobox', { name: 'Pull request status' })).toHaveValue('all');
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.getAllByRole('button', { name: /^View PR #/ })).toHaveLength(3);
    fireEvent.change(search, { target: { value: '17' } });
    expect(screen.getAllByRole('button', { name: /^View PR #/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /View PR #17:/ })).toBeInTheDocument();
  });

  it('preserves the list context when returning from an existing PR', () => {
    render(<ProjectReviewsTab />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search pull requests' }), {
      target: { value: '#17' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pull request status' }), {
      target: { value: 'ready' },
    });
    fireEvent.click(screen.getByRole('button', { name: /View PR #17:/ }));
    fireEvent.click(screen.getByRole('button', { name: /Pull requests \/ #17/ }));
    expect(screen.getByRole('searchbox', { name: 'Search pull requests' })).toHaveValue('#17');
    expect(screen.getByRole('combobox', { name: 'Pull request status' })).toHaveValue('ready');
    expect(screen.getByRole('tab', { name: '3 Open' })).toHaveAttribute('aria-selected', 'true');
  });

  it('supports keyboard group navigation and distinguishes an empty group from a filtered list', () => {
    render(<ProjectReviewsTab />);
    fireEvent.keyDown(screen.getByRole('tab', { name: '3 Open' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: '0 Closed' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'No closed pull requests' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('tab', { name: '0 Closed' }), { key: 'ArrowRight' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pull request status' }), {
      target: { value: 'checking' },
    });
    expect(screen.getByRole('heading', { name: 'No matching pull requests' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No open pull requests' })
    ).not.toBeInTheDocument();
  });

  it('shows loading and failure separately from empty data and retries the list request', async () => {
    let rejectList!: (error: Error) => void;
    pullRequestApi.fetchPullRequests.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectList = reject;
        })
    );
    render(<ProjectReviewsTab projectId="proj_real" />);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Propose your first change')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeDisabled();

    rejectList(new Error('Connection unavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
    expect(screen.queryByText('Propose your first change')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Propose your first change' })
    ).toBeInTheDocument();
    expect(pullRequestApi.fetchPullRequests).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'New pull request' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeEnabled();
  });

  it('opens a compare-first create flow with available PR branches', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    expect(screen.getByRole('heading', { name: 'New pull request' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Creation summary' })).toHaveTextContent(
      'Ready to create'
    );
    expect(screen.getByRole('combobox', { name: 'Source branch' })).toHaveTextContent(
      'outputs/bundle-refresh'
    );
    expect(screen.getByRole('combobox', { name: 'Base branch' })).toHaveTextContent('main');
    expect(screen.getByLabelText('Title')).toHaveValue('Output bundle refresh');
    expect(screen.getByText('YOps changes')).toBeInTheDocument();
    expect(screen.getByText('Source commit')).toBeInTheDocument();
    expect(screen.getByText('Base commit')).toBeInTheDocument();
    expect(screen.getByText(/differs between/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+112/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toHaveAttribute(
      'data-variant',
      'commit'
    );
  });

  it('preserves edited fields across source and base changes while updating untouched defaults', async () => {
    pullRequestApi.fetchCompareCandidates.mockImplementation((_projectId: string, base: string) =>
      Promise.resolve({
        base_branches: ['main', 'release/2026-07'],
        compare_branches: [
          { ...realCompareCandidate, base_branch: base },
          { ...behindCompareCandidate, base_branch: base },
        ],
      })
    );
    render(<ProjectReviewsTab projectId="proj_real" />);
    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    await screen.findByDisplayValue('Real feature');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My review title' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Source branch' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: /feature\/behind/i }));
    expect(screen.getByLabelText('Title')).toHaveValue('My review title');
    expect(screen.getByLabelText('Description')).toHaveValue(behindCompareCandidate.description);
    expect(screen.getByRole('combobox', { name: 'Source branch' })).not.toHaveTextContent(
      'Behind base'
    );

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'My review notes' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Base branch' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'release/2026-07' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled()
    );
    expect(screen.getByRole('combobox', { name: 'Source branch' })).toHaveTextContent(
      'real/feature'
    );
    expect(screen.getByLabelText('Title')).toHaveValue('My review title');
    expect(screen.getByLabelText('Description')).toHaveValue('My review notes');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh branch comparisons' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled()
    );
    expect(screen.getByLabelText('Title')).toHaveValue('My review title');
    expect(screen.getByLabelText('Description')).toHaveValue('My review notes');
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));
    expect(pullRequestApi.createPullRequest).toHaveBeenCalledWith(
      'proj_real',
      expect.objectContaining({
        title: 'My review title',
        description: 'My review notes',
        source_branch: 'real/feature',
        target_branch: 'release/2026-07',
      })
    );
  });

  it('offers the existing PR without claiming the comparison is ready to create', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main'],
      compare_branches: [
        {
          ...realCompareCandidate,
          status: 'already_open',
          status_label: 'PR #7 already open',
          open_pull_request_number: 7,
        },
      ],
    });
    const navigate = vi.fn();
    render(<ProjectReviewsTab projectId="proj_real" onPullRequestNumberChange={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    const existing = await screen.findByRole('button', { name: 'View PR #7' });
    expect(screen.getByRole('complementary', { name: 'Creation summary' })).toHaveTextContent(
      'PR #7 already open'
    );
    expect(screen.queryByText('Ready to create')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeDisabled();
    expect(screen.queryByText('YOps (you)')).not.toBeInTheDocument();
    fireEvent.click(existing);
    expect(navigate).toHaveBeenCalledWith(7);
    expect(pullRequestApi.createPullRequest).not.toHaveBeenCalled();
  });

  it('distinguishes a failed comparison from empty branches and recovers without losing the form', async () => {
    pullRequestApi.fetchCompareCandidates
      .mockResolvedValueOnce({ base_branches: ['main'], compare_branches: [realCompareCandidate] })
      .mockRejectedValueOnce(new Error('Comparison request failed'))
      .mockResolvedValue({ base_branches: ['main'], compare_branches: [realCompareCandidate] });
    render(<ProjectReviewsTab projectId="proj_real" />);
    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    await screen.findByDisplayValue('Real feature');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Keep this title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh branch comparisons' }));
    expect(await screen.findByText('Comparison request failed')).toBeInTheDocument();
    expect(
      screen.queryByText('No other committed branches can be compared with this base.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled()
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Keep this title');
  });

  it('loads an existing PR by number when it is absent from the list and no route callback is provided', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main'],
      compare_branches: [
        {
          ...realCompareCandidate,
          status: 'already_open',
          status_label: 'PR #1 already open',
          open_pull_request_number: 1,
        },
      ],
    });
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    render(<ProjectReviewsTab projectId="proj_real" />);
    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'View PR #1' }));
    expect(
      await screen.findByRole('heading', { name: blockedPullRequest.title })
    ).toBeInTheDocument();
    expect(pullRequestApi.fetchPullRequest).toHaveBeenCalledWith('proj_real', 1);
    expect(pullRequestApi.createPullRequest).not.toHaveBeenCalled();
  });

  it('locks the submitted form and preserves its content for retry after a failed create', async () => {
    let rejectCreate!: (error: Error) => void;
    pullRequestApi.createPullRequest.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        })
    );
    render(<ProjectReviewsTab projectId="proj_real" />);
    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    await screen.findByDisplayValue('Real feature');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Keep these notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Source branch' })).toBeDisabled();
    rejectCreate(new Error('The source branch changed. Refresh and try again.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The source branch changed.');
    expect(screen.getByLabelText('Description')).toHaveValue('Keep these notes');
    expect(screen.getByLabelText('Description')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled();
  });

  it('shows both sides of a field instead of a truncated one-line diff', () => {
    changePreview.mockReturnValue({
      changes: [
        {
          afterValue: 'dev problem text that stays fully visible',
          beforeValue: 'main problem text that stays fully visible',
          id: 'modified:candidate/product/problem',
          kind: 'modified',
          op: 'SET',
          path: 'candidate/product/problem',
          reason: 'Updated problem statement',
          summary: 'Updated problem statement',
        },
        {
          afterValue: '个性化学习路径推荐',
          beforeValue: 'No value recorded',
          id: 'added:candidate/requirements/personalized_learning_path/title',
          kind: 'added',
          op: 'ADD',
          path: 'candidate/requirements/personalized_learning_path/title',
          reason: 'Added requirement title',
          summary: 'Added requirement title',
        },
      ],
      error: null,
      loading: false,
    });
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    expect(screen.getByText('candidate.product')).toBeInTheDocument();
    expect(document.body.textContent).toContain('main problem text that stays fully visible');
    expect(document.body.textContent).toContain('dev problem text that stays fully visible');
    expect(screen.getByText('Added in outputs/bundle-refresh')).toBeInTheDocument();
    expect(screen.getByText('个性化学习路径推荐')).toBeInTheDocument();
    expect(screen.queryByText('No value recorded')).not.toBeInTheDocument();
  });

  it('previews a diverged branch from its merge base, not the moved target head', async () => {
    pullRequestApi.fetchCompareCandidates.mockResolvedValue({
      base_branches: ['main'],
      compare_branches: [
        {
          ...realCompareCandidate,
          merge_base_commit_id: 'sha256:fork-point',
          behind_by: 1,
        },
      ],
    });
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(await screen.findByDisplayValue('Real feature')).toBeInTheDocument();
    expect(changePreview).toHaveBeenLastCalledWith(
      'proj_real',
      'sha256:source-preview',
      'sha256:fork-point'
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
      await screen.findByText('No other committed branches can be compared with this base.')
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
    expect(screen.getByRole('button', { name: /View PR #20:/ })).toHaveTextContent('Checks queued');
    expect(screen.queryByText('Merge simulation')).not.toBeInTheDocument();
  });

  it('opens existing PRs into a structured PR detail skeleton', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: /^View PR #/ })[0]);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Changes')).toBeInTheDocument();
    expect(screen.getByText('release_plan')).toBeInTheDocument();
    expect(screen.getByText('Merged result preview')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Merge readiness')).toBeInTheDocument();
    expect(screen.getByText('Change summary')).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole('button', { name: /^View PR #/ })[0]);

    expect(screen.getByText('Checks queued')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rerun readiness' }));

    expect(screen.getByText('Ready to merge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
  });

  it('moves a merged PR into the closed list after merge succeeds', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: /^View PR #/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Merge PR' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Merged' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getAllByText(/^Merged$/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Release note cleanup').closest('button')!);
    expect(screen.getByText('Merged')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
  });

  it('closes an open PR without merging and moves it into the closed list', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: /^View PR #/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close PR' }));

    expect(screen.getByText(/Close without merging/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm close' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close PR' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2 Open' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1 Closed' })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getAllByText(/^Closed$/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Release note cleanup').closest('button')!);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
  });

  it('applies a selected conflict side and enables merge on a blocked PR', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: /^View PR #/ })[1]);
    fireEvent.click(screen.getByText('Changes'));

    expect(
      screen.getByText('Review the blocked checks and unresolved changes.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply resolution' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use feature' }));

    expect(screen.getByText('All conflicts decided. Merge is ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Use feature' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit merged value' }));
    expect(screen.getByRole('checkbox', { name: 'Use feature' })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep main' }));
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit merged value' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Keep main' })).not.toBeInTheDocument();
  });

  it('resolves each conflicting field on its own before merging a project PR', async () => {
    pullRequestApi.fetchPullRequests.mockResolvedValue({
      pull_requests: [blockedPullRequest],
      counts: { active: 1, merged: 0 },
    });
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    pullRequestApi.saveMergeDecision.mockResolvedValue(1);
    pullRequestApi.mergePullRequest.mockResolvedValue({
      ...blockedPullRequestDetail,
      merge_commit_id: 'sha256:merged',
      status: 'merged',
    });

    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(await screen.findByRole('button', { name: /^View PR #/ }));
    expect(await screen.findByRole('heading', { name: 'Resolve conflict' })).toBeInTheDocument();
    expect(await screen.findByText('2 of 2 conflicts still need a decision.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Keep main for problem' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Write a value for title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom value for title' }), {
      target: { value: 'My own title' },
    });
    expect(screen.getByText('1 of 2 conflicts still need a decision.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next conflict/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use review/pr-demo' }));
    expect(screen.getByText('All conflicts decided. Saving decisions…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeDisabled();

    const decisions = {
      conflictResolutions: {
        'candidate/product': {
          edit: {
            key: 'product',
            slots: { owner: 'dev', problem: 'Main problem', title: 'My own title' },
            children: [],
          },
        },
        'candidate/requirements': {
          edit: { key: 'requirements', slots: { priority: 'should' }, children: [] },
        },
      },
      keepFromSource: ['candidate/extra'],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    };
    await waitFor(
      () => {
        expect(pullRequestApi.saveMergeDecision).toHaveBeenLastCalledWith(
          'mdraft_1',
          decisions,
          expect.any(Number)
        );
      },
      { timeout: 3000 }
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Merge PR' }));
    await waitFor(() => {
      expect(pullRequestApi.mergePullRequest).toHaveBeenCalledWith('proj_real', {
        expected_source_commit_id: 'sha256:feature',
        expected_target_commit_id: 'sha256:main',
        number: 1,
        decisions,
      });
    });
  });

  it('uses the actual merge comparison for Overview and exposes each check status', async () => {
    pullRequestApi.fetchPullRequest.mockResolvedValue({
      ...blockedPullRequestDetail,
      diff_summary: { changed_nodes: 99, yops_operations: 0, output_impacts: 0, source_refs: 0 },
      checks: [
        {
          ...blockedPullRequestDetail.checks[0],
          id: 'failed',
          title: 'Failed evidence',
          status: 'failed',
          message: 'Verification failed.',
        },
        {
          ...blockedPullRequestDetail.checks[0],
          id: 'running',
          title: 'Running evidence',
          status: 'running',
          message: 'Verification is running.',
        },
        {
          ...blockedPullRequestDetail.checks[0],
          id: 'provider',
          title: 'Constraints',
          status: 'passed',
          message: 'No CommitV2 Statement constraint provider configured.',
        },
        {
          ...blockedPullRequestDetail.checks[0],
          id: 'long',
          title: 'Long evidence',
          status: 'warning',
          message: 'Evidence detail. '.repeat(30),
        },
      ],
    });
    pullRequestApi.fetchMergeReview.mockResolvedValue({
      ...conflictReview,
      merge_base_commit_id: 'sha256:abcdef123456',
    });
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByRole('heading', { name: 'Resolve conflict' });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('3 changed nodes · 5 changed fields')).toBeInTheDocument();
    const overview = screen.getByRole('tabpanel', { name: 'Overview' });
    expect(within(overview).getByText('Conflicts').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('abcdef1')).toBeInTheDocument();
    expect(screen.queryByText('rollout.stage')).not.toBeInTheDocument();
    expect(screen.queryByText('release_plan.rollout.branch')).not.toBeInTheDocument();
    expect(within(overview).getByText('Failed')).toBeInTheDocument();
    expect(within(overview).getByText('Running')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Checks' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Checks' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No CommitV2 Statement constraint provider configured.')).toBeVisible();
    expect(screen.getByText('Failed')).toBeVisible();
    const evidence = screen.getByText('View full evidence');
    fireEvent.click(evidence);
    expect(evidence.closest('details')).toHaveAttribute('open');
  });

  it('preserves pending decisions across tabs and retries a failed save', async () => {
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    pullRequestApi.saveMergeDecision
      .mockRejectedValueOnce(new Error('Connection unavailable'))
      .mockResolvedValue(1);
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByRole('heading', { name: 'Resolve conflict' });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    await screen.findByText('3 changed nodes · 5 changed fields');
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep main' }));
    expect(screen.getByText('Saving decisions…')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Save failed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review save error' }));
    expect(screen.getByRole('radio', { name: 'Keep main for problem' })).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
    expect(await screen.findByText('Decisions saved')).toBeVisible();
    expect(pullRequestApi.saveMergeDecision).toHaveBeenCalledTimes(2);
    expect(pullRequestApi.fetchMergeReview).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
  });

  it('does not mark newer choices saved when an earlier save finishes', async () => {
    let finishFirst!: (revision: number) => void;
    let finishSecond!: (revision: number) => void;
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    pullRequestApi.saveMergeDecision
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = resolve;
          })
      );
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByRole('heading', { name: 'Resolve conflict' });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    await screen.findByText('3 changed nodes · 5 changed fields');
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep main' }));
    await waitFor(() => expect(pullRequestApi.saveMergeDecision).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('radio', { name: 'Use review/pr-demo for problem' }));
    await act(async () => finishFirst(1));
    expect(screen.getByText('Saving decisions…')).toBeVisible();
    expect(screen.queryByText('Decisions saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeDisabled();
    await waitFor(() => expect(pullRequestApi.saveMergeDecision).toHaveBeenCalledTimes(2));
    expect(pullRequestApi.saveMergeDecision).toHaveBeenLastCalledWith(
      'mdraft_1',
      expect.any(Object),
      1
    );
    await act(async () => finishSecond(2));
    expect(screen.getByText('Decisions saved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
  });

  it('keeps ended PR decisions read-only and shows the final outcome', async () => {
    pullRequestApi.fetchPullRequest.mockResolvedValue({
      ...blockedPullRequestDetail,
      status: 'merged',
      merge_commit_id: 'sha256:merged',
    });
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByText('3 changed nodes · 5 changed fields');
    expect(screen.getByRole('heading', { name: 'Outcome' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    expect(screen.getByText('Merged into main.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Recorded decision' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Keep main for problem' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Keep main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
    expect(pullRequestApi.saveMergeDecision).not.toHaveBeenCalled();
  });

  it('retries an unavailable comparison without inventing zero changes', async () => {
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview
      .mockRejectedValueOnce(new Error('Comparison unavailable'))
      .mockResolvedValue(conflictReview);
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByRole('button', { name: 'Retry comparison' });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Comparison unavailable: Comparison unavailable')).toBeVisible();
    expect(screen.queryByText('0 changed nodes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }));
    expect(await screen.findByRole('heading', { name: 'Resolve conflict' })).toBeInTheDocument();
    expect(pullRequestApi.fetchMergeReview).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByText('3 changed nodes · 5 changed fields')).toBeVisible();
  });

  it('brings the selected change into reach on a narrow screen and expands long values', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    );
    const longValue = 'A long field value '.repeat(20);
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue({
      ...conflictReview,
      nodes: [
        ...conflictReview.nodes,
        {
          path: 'candidate/long',
          status: 'auto',
          presence: { base: true, source: true, target: true },
          slots: [
            {
              key: 'description',
              base: 'Before',
              target: 'Before',
              source: longValue,
              merged: longValue,
              conflict: false,
            },
          ],
        },
      ],
    });
    render(<ProjectReviewsTab projectId="proj_real" initialPullRequestNumber={1} />);
    await screen.findByRole('heading', { name: 'Resolve conflict' });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    await screen.findByText('4 changed nodes · 6 changed fields');
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect candidate.long' }));
    const inspector = screen.getByRole('complementary', { name: 'Change inspector' });
    await waitFor(() => expect(inspector).toHaveFocus());
    const expand = within(inspector).getByRole('button', { name: 'Show full value' });
    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(within(inspector).getByText(longValue.trim())).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to changes' }));
    expect(screen.getByRole('button', { name: 'Inspect candidate.long' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Conflicts' }));
    expect(within(inspector).getByText('candidate.product')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Inspect candidate.long' })
    ).not.toBeInTheDocument();
  });

  it('opens the conflict page as soon as a new PR finds conflicts', async () => {
    pullRequestApi.createPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchPullRequest.mockResolvedValue(blockedPullRequestDetail);
    pullRequestApi.fetchMergeReview.mockResolvedValue(conflictReview);
    render(<ProjectReviewsTab projectId="proj_real" />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    expect(await screen.findByDisplayValue('Real feature')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create pull request' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));

    expect(await screen.findByRole('heading', { name: 'Resolve conflict' })).toBeInTheDocument();
    expect(pullRequestApi.fetchMergeReview).toHaveBeenCalledWith('proj_real', 1);
  });
});

const blockedPullRequest = {
  id: 'pr_blocked',
  number: 1,
  project_id: 'proj_real',
  title: 'Propose weekly product brief',
  description: 'Review the weekly brief.',
  source_branch: 'review/pr-demo',
  target_branch: 'main',
  source_commit_id: 'sha256:feature',
  target_base_commit_id: 'sha256:main',
  merge_draft_id: 'mdraft_1',
  merge_commit_id: null,
  status: 'blocked' as const,
  author_id: 'you',
  steward_id: null,
  review_owner_id: null,
  workspace_id: null,
  release_lane_id: null,
  linked_work: null,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
  merged_at: null,
  closed_at: null,
};

const blockedPullRequestDetail = {
  ...blockedPullRequest,
  diff_summary: { changed_nodes: 3, yops_operations: 0, output_impacts: 0, source_refs: 0 },
  checks: [
    {
      id: 'chk_conflict',
      pull_request_id: 'pr_blocked',
      kind: 'conflict_resolution',
      status: 'blocked',
      title: 'Conflict resolution',
      message: '2 structural conflict(s) require a decision.',
      started_at: null,
      completed_at: null,
    },
  ],
  activity: [],
};

const conflictReview = {
  draft_id: 'mdraft_1',
  decision_revision: 0,
  decisions: null,
  source_commit_id: 'sha256:feature',
  target_commit_id: 'sha256:main',
  merge_base_commit_id: 'sha256:base',
  nodes: [
    {
      path: 'candidate/extra',
      status: 'source_only',
      presence: { base: false, source: true, target: false },
      slots: [{ key: 'ready', source: true, merged: true, conflict: false }],
    },
    {
      path: 'candidate/product',
      status: 'conflict',
      presence: { base: true, source: true, target: true },
      slots: [
        {
          key: 'owner',
          base: 'base',
          source: 'dev',
          target: 'base',
          merged: 'dev',
          conflict: false,
        },
        {
          key: 'problem',
          base: 'Old problem',
          source: 'Dev problem',
          target: 'Main problem',
          conflict: true,
        },
        { key: 'title', base: 'Old', source: 'Dev title', target: 'Main title', conflict: true },
      ],
    },
    {
      path: 'candidate/requirements',
      status: 'conflict',
      presence: { base: true, source: true, target: true },
      slots: [{ key: 'priority', base: 'may', source: 'should', target: 'must', conflict: true }],
    },
  ],
};
