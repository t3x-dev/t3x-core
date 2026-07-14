// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';

describe('ProjectSchemasTab', () => {
  it('renders the single-family schema version browser from fixtures', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "One versioned contract defines the shape of this repository's structured state. New workspaces use the current version; existing commits keep their original version."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('PRD Schema').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
    expect(screen.queryByText('Docker Compose')).not.toBeInTheDocument();
  });

  it('uses the registry current pointer independently of workspace preview bindings', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    const currentVersionFact = screen.getByText('Current version').parentElement;
    expect(currentVersionFact).not.toBeNull();
    expect(within(currentVersionFact as HTMLElement).getByText('v2')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });
});
