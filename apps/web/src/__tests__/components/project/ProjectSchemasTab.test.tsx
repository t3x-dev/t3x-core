// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';

describe('ProjectSchemasTab', () => {
  it('renders the S1 schema registry surface from fixtures', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByText('Schema registry')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Project-level schema releases use draft, active, and deprecated states. Workspaces only bind to versions.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
  });
});
