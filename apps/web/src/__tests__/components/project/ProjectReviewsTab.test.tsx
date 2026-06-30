// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';

describe('ProjectReviewsTab', () => {
  it('distinguishes project-level review types and schema upgrade impact', () => {
    render(<ProjectReviewsTab />);

    expect(screen.getByText('Project reviews')).toBeInTheDocument();
    expect(screen.getByText('Workspace candidate review')).toBeInTheDocument();
    expect(screen.getByText('Schema upgrade review')).toBeInTheDocument();
    expect(screen.getByText('Merge review')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v2 -> v3')).toBeInTheDocument();
    expect(screen.getByText('Impact: 3 existing nodes need migration.')).toBeInTheDocument();
    expect(screen.getAllByText('Base commit')).toHaveLength(3);
  });
});
