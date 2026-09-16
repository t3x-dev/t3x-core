// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectCommunityTab } from '@/components/project/ProjectCommunityTab';

describe('ProjectCommunityTab', () => {
  it('renders the source-matched empty community state and connected destinations', () => {
    render(<ProjectCommunityTab projectId="project one" />);

    expect(screen.getByRole('heading', { name: 'Project community' })).toBeInTheDocument();
    expect(
      screen.getByText('Human handoffs linked to your project, without changing structured State.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bring the right people into the work' })
    ).toBeInTheDocument();
    expect(screen.getByText('No collaborators linked')).toBeInTheDocument();
    expect(screen.getByText('No links connected')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Open workspaces/i })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=workspaces'
    );
    expect(screen.getByRole('link', { name: /View pull requests/i })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=pull-requests'
    );
    expect(screen.getByRole('link', { name: /Commit history/i })).toHaveAttribute(
      'href',
      '/project/project%20one/history?branch=main&view=list'
    );

    expect(screen.queryByText('PRD audience handoff')).not.toBeInTheDocument();
    expect(screen.queryByText(/apply yops/i)).not.toBeInTheDocument();
  });
});
