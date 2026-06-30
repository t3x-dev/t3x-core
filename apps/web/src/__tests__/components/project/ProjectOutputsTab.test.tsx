// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';

describe('ProjectOutputsTab', () => {
  it('renders only committed output artifacts with visible freshness labels', () => {
    render(<ProjectOutputsTab />);

    expect(screen.getByText('Committed outputs')).toBeInTheDocument();
    expect(screen.getByText('PRD audience brief')).toBeInTheDocument();
    expect(screen.getByText('Launch notes summary')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getAllByText('Bound commit')).toHaveLength(2);
    expect(screen.queryByText(/draft target/i)).not.toBeInTheDocument();
  });
});
