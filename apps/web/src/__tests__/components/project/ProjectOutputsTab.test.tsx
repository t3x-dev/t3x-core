// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';

describe('ProjectOutputsTab', () => {
  it('renders committed Leaf artifacts with source, freshness, constraints, and actions', () => {
    render(<ProjectOutputsTab />);

    expect(screen.getByText('Committed outputs')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Outputs are committed Leaf artifacts with stable source commits, freshness, and constraint status. Workspace output targets remain draft configuration until commit.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('PRD audience brief')).toBeInTheDocument();
    expect(screen.getByText('Launch notes summary')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getAllByText('Bound commit')).toHaveLength(2);
    expect(screen.getAllByText('Source workspace')).toHaveLength(2);
    expect(screen.getByText('Fresh from latest committed PRD state.')).toBeInTheDocument();
    expect(
      screen.getByText('Stale because release note cleanup has a newer committed head.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Committed state only, audience evidence preserved.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Regenerate before publishing so scope matches latest state.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View output: PRD audience brief' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Regenerate from latest commit: Launch notes summary' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/draft target/i)).not.toBeInTheDocument();
  });
});
