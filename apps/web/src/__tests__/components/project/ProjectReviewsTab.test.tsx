// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';

describe('ProjectReviewsTab', () => {
  it('renders the PR workbench list with merge proposal language', () => {
    render(<ProjectReviewsTab />);

    expect(screen.getByText('Merge proposals for structured state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create PR/i })).toBeInTheDocument();
    expect(screen.getByText('Active proposals')).toBeInTheDocument();
    expect(screen.getByText('Merged archive')).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v3 rollout')).toBeInTheDocument();
    expect(screen.getByText('Audience handoff updates')).toBeInTheDocument();
    expect(screen.getByText('ready to merge')).toBeInTheDocument();
    expect(screen.getByText('needs decision')).toBeInTheDocument();
  });

  it('opens the full-page create flow without a file diff preview', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));

    expect(screen.getByText('Compose merge proposal')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Audience handoff updates');
    expect(screen.getByText('Proposal note')).toBeInTheDocument();
    expect(screen.getByText('Source commit')).toBeInTheDocument();
    expect(screen.getByText('Base commit')).toBeInTheDocument();
    expect(screen.queryByText(/Changes from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+112/)).not.toBeInTheDocument();
  });

  it('moves created PRs into the detail view where checks and merge are managed', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Create PR/i }));
    const createView = screen.getByText('Proposal note').closest('section');
    expect(createView).not.toBeNull();
    fireEvent.click(within(createView as HTMLElement).getByRole('button', { name: 'Create PR' }));

    expect(screen.getByText('Checks')).toBeInTheDocument();
    expect(screen.getByText('Merge simulation')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Merge'));
    expect(
      screen.getByText(/Workspace validation failures are not surfaced here/i)
    ).toBeInTheDocument();
  });

  it('opens existing PRs into a structured PR detail skeleton', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Structured diff')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Structured diff'));
    expect(screen.getByText('Changed nodes')).toBeInTheDocument();
    expect(screen.getByText('YOps operations')).toBeInTheDocument();
  });
});
