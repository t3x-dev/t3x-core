// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';

describe('ProjectSchemasTab', () => {
  it('renders the multi-family schema version browser from fixtures', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Schema families define different kinds of structured state. Choose a family to inspect its current contract, historical versions, typed relations, and canonical YAML.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'PRD Schema v2' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Skill Schema v1' })).toBeInTheDocument();
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
