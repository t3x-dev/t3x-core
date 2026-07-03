// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectCommunityTab } from '@/components/project/ProjectCommunityTab';

describe('ProjectCommunityTab', () => {
  it('renders project handoff notes, collaborators, and external context', () => {
    render(<ProjectCommunityTab />);

    expect(screen.getByText('Project community')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Human handoff notes, collaborators, and external context stay linked to project objects without entering deterministic mutation paths.'
      )
    ).toBeInTheDocument();

    expect(screen.getByText('Handoff notes')).toBeInTheDocument();
    expect(screen.getByText('PRD audience handoff')).toBeInTheDocument();
    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v3 rollout')).toBeInTheDocument();
    expect(screen.getByText('Workspace: PRD audience handoff')).toBeInTheDocument();
    expect(screen.getByText('Output: Launch notes summary')).toBeInTheDocument();
    expect(screen.getByText('Review: PRD Schema v3 rollout')).toBeInTheDocument();

    expect(screen.getByText('Project collaborators')).toBeInTheDocument();
    expect(screen.getAllByText('Product reviewer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Schema owner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Release owner').length).toBeGreaterThan(0);

    expect(screen.getByText('External context')).toBeInTheDocument();
    expect(screen.getByText('Discord thread')).toBeInTheDocument();
    expect(screen.getByText('Linear issue')).toBeInTheDocument();
    expect(screen.getByText(/not source evidence until imported/i)).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Open workspace: PRD audience handoff' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open output: Release note cleanup' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open review: PRD Schema v3 rollout' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/apply yops/i)).not.toBeInTheDocument();
  });
});
