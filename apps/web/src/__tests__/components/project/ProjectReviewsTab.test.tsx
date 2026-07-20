// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';

describe('ProjectReviewsTab', () => {
  it('renders a focused pull request list without placeholder controls', () => {
    render(<ProjectReviewsTab />);

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create PR/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by title, branch, or author')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\s*Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\s*Closed/i })).toBeInTheDocument();
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

    expect(screen.getByText('Open pull request')).toBeInTheDocument();
    expect(screen.getByText('Available branches')).toBeInTheDocument();
    expect(screen.getAllByText('outputs/bundle-refresh').length).toBeGreaterThan(0);
    expect(screen.getAllByText('yschema-p0/1145-contract-source').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Title')).toHaveValue('Output bundle refresh');
    expect(screen.getByText('YOps changes')).toBeInTheDocument();
    expect(screen.getByText('Head commit')).toBeInTheDocument();
    expect(screen.getByText('Base commit')).toBeInTheDocument();
    expect(screen.queryByText(/Changes from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+112/)).not.toBeInTheDocument();
  });

  it('returns to the open PR list after creation and highlights the new PR', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    const createView = screen.getByText('Output bundle refresh').closest('section');
    expect(createView).not.toBeNull();
    fireEvent.click(within(createView as HTMLElement).getByRole('button', { name: 'Create PR' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\s*Open/i })).toBeInTheDocument();
    expect(screen.getByText('Output bundle refresh')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('checks queued')).toBeInTheDocument();
    expect(screen.queryByText('Merge simulation')).not.toBeInTheDocument();
  });

  it('opens existing PRs into a structured PR detail skeleton', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Structured diff')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Linked work')).toBeInTheDocument();
    expect(screen.queryByText('Steward')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Release lane')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Structured diff'));
    expect(screen.getByText('Changed nodes')).toBeInTheDocument();
    expect(screen.getByText('YOps operations')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Checks'));
    expect(screen.getByText('Source commit')).toBeInTheDocument();
    expect(screen.getByText('Merge simulation')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Activity'));
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.queryByText('Review pending')).not.toBeInTheDocument();
  });

  it('moves a newly opened PR to ready after rerunning readiness', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    const createView = screen.getByText('Output bundle refresh').closest('section');
    expect(createView).not.toBeNull();
    fireEvent.click(within(createView as HTMLElement).getByRole('button', { name: 'Create PR' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);

    expect(screen.getByText('checks queued')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rerun readiness' }));

    expect(screen.getByText('ready to merge')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Merge'));
    expect(screen.getByRole('button', { name: 'Merge PR' })).toBeEnabled();
  });

  it('moves a merged PR into the closed list after merge succeeds', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View PR' })[0]);
    fireEvent.click(screen.getByText('Merge'));
    fireEvent.click(screen.getByRole('button', { name: 'Merge PR' }));

    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Closed/i })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('Just merged')).toBeInTheDocument();
    expect(screen.getAllByText('merged').length).toBeGreaterThan(0);

    const mergedRow = screen.getByText('Release note cleanup').closest('article');
    expect(mergedRow).not.toBeNull();
    fireEvent.click(within(mergedRow as HTMLElement).getByRole('button', { name: 'View PR' }));
    fireEvent.click(screen.getByText('Merge'));
    expect(screen.getByRole('heading', { name: 'Merged' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /2\s*Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Closed/i })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('Just closed')).toBeInTheDocument();
    expect(screen.getAllByText('closed').length).toBeGreaterThan(0);

    const closedRow = screen.getByText('Release note cleanup').closest('article');
    expect(closedRow).not.toBeNull();
    fireEvent.click(within(closedRow as HTMLElement).getByRole('button', { name: 'View PR' }));
    fireEvent.click(screen.getByText('Merge'));
    expect(screen.getByRole('heading', { name: 'Closed without merging' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rerun readiness' })).not.toBeInTheDocument();
  });
});
