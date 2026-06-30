// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

describe('project foundation previews', () => {
  it('renders the Workspaces preview for any project id during A0', () => {
    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByText('Workspace foundation preview')).toBeInTheDocument();
    expect(screen.getByText('PRD audience handoff')).toBeInTheDocument();
    expect(screen.getByText('1 chat, 1 doc')).toBeInTheDocument();
  });

  it('renders the Schemas preview for any project id during A0', () => {
    render(<ProjectSchemasTab projectId="proj_other" />);

    expect(screen.getByText('Schema registry')).toBeInTheDocument();
    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
  });
});
