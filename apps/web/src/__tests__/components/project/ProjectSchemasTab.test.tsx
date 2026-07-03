// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';

describe('ProjectSchemasTab', () => {
  it('renders the S1 schema registry surface from fixtures', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByText('Schema templates')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Choose a structured-state template, pick a version, then bind it as the project default or pin it to a workspace.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
    expect(screen.getByText('Docker Compose')).toBeInTheDocument();
  });

  it('binds the selected schema release to the current workspace target', () => {
    const onWorkspaceSchemaBindingChange = vi.fn();
    render(
      <ProjectSchemasTab
        onWorkspaceSchemaBindingChange={onWorkspaceSchemaBindingChange}
        projectId="proj_test"
      />
    );

    expect(screen.getByText('PRD audience handoff')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use for current workspace' }));

    expect(onWorkspaceSchemaBindingChange).toHaveBeenCalledWith({
      binding: { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
      scope: 'current_workspace',
      workspaceId: 'workspace_prd_handoff',
    });
  });
});
