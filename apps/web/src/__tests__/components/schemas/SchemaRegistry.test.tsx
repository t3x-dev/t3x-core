// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaRegistry } from '@/components/schemas';
import { getSchemaReleasePreviews } from '@/data/schemaReleases';

describe('SchemaRegistry', () => {
  it('shows template, version, and detail columns', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    expect(screen.getByText('Schema templates')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Versions')).toBeInTheDocument();
    expect(screen.getByText('PRD')).toBeInTheDocument();
    expect(screen.getByText('Docker Compose')).toBeInTheDocument();
    expect(screen.getAllByText('2 versions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('shows version details and workspace binding actions without direct edit affordances', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    expect(screen.getByText('Published version is immutable')).toBeInTheDocument();
    expect(screen.getByText('Required fields')).toBeInTheDocument();
    expect(screen.getByText('Compatible with')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set as project default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use for current workspace' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create workspace with template' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare with current' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('emits schema binding actions for the selected version', () => {
    const onBindRelease = vi.fn();
    render(
      <SchemaRegistry
        bindingTargetLabel="PRD audience handoff"
        currentWorkspaceBindingLabel="PRD Schema v2"
        onBindRelease={onBindRelease}
        projectDefaultBindingLabel="Release Note Schema v1"
        releases={getSchemaReleasePreviews('proj_test')}
      />
    );

    expect(screen.getByText('Workspace: PRD Schema v2')).toBeInTheDocument();
    expect(screen.getByText('Project default: Release Note Schema v1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use for current workspace' }));
    expect(onBindRelease).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PRD Schema', version: 'v2' }),
      'current_workspace'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set as project default' }));
    expect(onBindRelease).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PRD Schema', version: 'v2' }),
      'project_default'
    );
  });

  it('switches version detail when another template is selected', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    fireEvent.click(screen.getByRole('button', { name: /Docker Compose/i }));

    expect(screen.getAllByText('Docker Compose v2').length).toBeGreaterThan(0);
    expect(screen.getByText('root: compose')).toBeInTheDocument();
    expect(screen.getByText('services.*.image')).toBeInTheDocument();
    expect(screen.getAllByText('v2 current').length).toBeGreaterThan(0);
  });
});
