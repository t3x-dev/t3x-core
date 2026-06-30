// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

describe('project foundation previews', () => {
  it('renders the fixture-backed Workspaces workbench for any project id during W1', () => {
    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRD audience handoff/ })).toBeInTheDocument();
    expect(screen.getAllByText('1 chat, 1 doc').length).toBeGreaterThan(0);
  });

  it('renders the Schemas preview for any project id during A0', () => {
    render(<ProjectSchemasTab projectId="proj_other" />);

    expect(screen.getByText('Schema release preview')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v2')).toBeInTheDocument();
  });
});
