// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';

describe('ProjectReviewsTab', () => {
  it('distinguishes project-level review types, decisions, and next actions', () => {
    render(<ProjectReviewsTab />);

    expect(screen.getByText('Project reviews')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Project-level decision queue for workspace candidates, schema upgrades, and merge reviews.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace candidate review')).toBeInTheDocument();
    expect(screen.getByText('Schema upgrade review')).toBeInTheDocument();
    expect(screen.getByText('Merge review')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v2 -> v3')).toBeInTheDocument();
    expect(screen.getByText('Confirm /audience/primary before handoff.')).toBeInTheDocument();
    expect(screen.getByText('3 existing nodes need migration.')).toBeInTheDocument();
    expect(screen.getByText('Ready for decision')).toBeInTheDocument();
    expect(
      screen.getByText('YOps validation passed, no schema gaps, diff is ready for commit.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open workspace review: PRD audience handoff' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review schema impact: PRD Schema v3 rollout' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review merge: Release note cleanup merge' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Base')).toHaveLength(3);
  });
});
