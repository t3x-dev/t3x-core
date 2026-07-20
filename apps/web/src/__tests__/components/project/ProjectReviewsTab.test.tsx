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
    expect(screen.getByRole('button', { name: /3\s*Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\s*Closed/i })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v3 rollout')).toBeInTheDocument();
    expect(screen.getByText('Audience handoff updates')).toBeInTheDocument();
    expect(screen.getByText('ready to merge')).toBeInTheDocument();
    expect(screen.getByText('needs decision')).toBeInTheDocument();
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

    expect(screen.getByText('Merge proposals for structured state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\s*Open/i })).toBeInTheDocument();
    expect(screen.getByText('Output bundle refresh')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('checks queued')).toBeInTheDocument();
    expect(screen.queryByText('Merge simulation')).not.toBeInTheDocument();
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

  it('moves a merged PR into the closed list after merge succeeds', () => {
    render(<ProjectReviewsTab />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    fireEvent.click(screen.getByText('Merge'));
    fireEvent.click(screen.getByRole('button', { name: 'Merge PR' }));

    expect(screen.getByText('Merge proposals for structured state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Closed/i })).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('Just merged')).toBeInTheDocument();
    expect(screen.getAllByText('merged').length).toBeGreaterThan(0);
  });
});
