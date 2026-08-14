// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaRegistry } from '@/components/schemas';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';

function renderRegistry(projectId = 'proj_test') {
  return render(<SchemaRegistry {...getSchemaRegistryPreview(projectId)} />);
}

describe('SchemaRegistry', () => {
  it('opens a Schema identity without inferring a default version', () => {
    renderRegistry();

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRD Schema/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skill Schema/ })).toBeInTheDocument();
    expect(screen.getByText('Select a Schema version')).toBeInTheDocument();
    expect(screen.queryByText('Current version')).not.toBeInTheDocument();
    expect(screen.queryByText('Version behavior')).not.toBeInTheDocument();
    expect(screen.queryByText('0 commits')).not.toBeInTheDocument();
    expect(screen.queryByText(/Published from composition:/)).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Schema versions' })).toHaveClass(
      'rounded-none'
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('isolates Official and project Schemas using protected source tags', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const official = preview.families[0]!;
    render(
      <SchemaRegistry
        defaultFamilyId={official.id}
        families={[
          { ...official, source: 'official', tags: ['source:official'] },
          {
            ...official,
            id: 'published:projects/proj_test/prd',
            name: 'Project PRD',
            canonicalName: 'projects/proj_test/prd',
            source: 'team',
            tags: ['source:team'],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'My Schemas' }));
    expect(screen.getByRole('button', { name: /Project PRD/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^PRD Schema/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project PRD' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Official' }));
    expect(screen.getByRole('button', { name: /^PRD Schema/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Project PRD/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PRD Schema' })).toBeInTheDocument();
  });

  it('shows archived Schema identities without a separate status filter', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const archivedFamily = {
      ...preview.families[0]!,
      lifecycleStatus: 'archived' as const,
    };

    render(<SchemaRegistry defaultFamilyId={archivedFamily.id} families={[archivedFamily]} />);

    expect(
      screen.queryByRole('combobox', { name: 'Filter by Schema status' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRD Schema/ })).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('keeps long Schema and version collections inside bounded scroll regions', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const baseFamily = preview.families[0]!;
    const baseRelease = baseFamily.releases[0]!;
    const releases = Array.from({ length: 20 }, (_, index) => ({
      ...baseRelease,
      id: `release_${index}`,
      version: `1.0.${index}`,
    }));
    const families = Array.from({ length: 16 }, (_, index) => ({
      ...baseFamily,
      id: `schema_${index}`,
      name: `Schema ${index}`,
      canonicalName: `t3x/schema-${index}`,
      releases: index === 0 ? releases : baseFamily.releases,
    }));

    render(<SchemaRegistry defaultFamilyId="schema_0" families={families} />);

    expect(screen.getByLabelText('Schema results')).toHaveClass(
      'overflow-y-auto',
      '[scrollbar-gutter:stable]'
    );
    expect(screen.getByRole('button', { name: /Schema 15/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Schema version results')).toHaveClass(
      'overflow-x-auto',
      'min-[1101px]:overflow-y-auto'
    );
    expect(screen.getAllByRole('radio')).toHaveLength(20);
  });

  it('shows version details only after the user selects an exact version', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v2 Published/i }));

    expect(screen.getByText('PRD Schema v2')).toBeInTheDocument();
    expect(screen.getByText(/2 nodes · 8 paths/)).toBeInTheDocument();
    expect(screen.getByText('Applied explicitly per Workspace')).toBeInTheDocument();
  });

  it('applies only the selected exact version to a Workspace', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const onApplyToWorkspace = vi.fn().mockResolvedValue(undefined);
    render(
      <SchemaRegistry
        {...preview}
        bindingActions={{
          onApplyToWorkspace,
          pending: null,
          workspaceTarget: { id: 'workspace_main', title: 'Main workspace' },
        }}
      />
    );

    expect(screen.queryByRole('group', { name: 'Schema binding actions' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /v2 Published/i }));
    expect(screen.getByRole('group', { name: 'Schema binding actions' })).toBeInTheDocument();
    expect(screen.queryByText('Workspace binding')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    expect(onApplyToWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: 't3x/prd', version: 'v2' })
    );
    expect(
      screen.queryByRole('menuitem', { name: /Set as project default/i })
    ).not.toBeInTheDocument();
  });

  it('does not expose a Draft Schema version state', () => {
    const onApplyToWorkspace = vi.fn().mockResolvedValue(undefined);
    render(
      <SchemaRegistry
        {...getSchemaRegistryPreview('proj_test')}
        bindingActions={{
          onApplyToWorkspace,
          pending: null,
          workspaceTarget: { id: 'workspace_main', title: 'Main workspace' },
        }}
      />
    );

    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /v3 Published/i }));

    expect(screen.getByRole('button', { name: 'Apply to Main workspace' })).toBeEnabled();
  });

  it('remembers explicit selections per Schema while resetting the detail view', () => {
    renderRegistry();
    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Skill Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Relations' }));
    fireEvent.click(screen.getByRole('button', { name: /PRD Schema/ }));

    expect(screen.getByRole('radio', { name: /v1 Historical/i })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
  });

  it('compares a version with its recorded baseline rather than a current pointer', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v3 Published/i }));
    expect(screen.queryByRole('button', { name: /Compare with/i })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes vs v2' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByRole('tab', { name: 'Changes vs v2' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('v3 compared with v2')).toBeInTheDocument();
    expect(screen.getByText('requirements.*.evidence')).toBeInTheDocument();
  });

  it('does not offer Changes when a version has no recorded lineage', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));

    expect(screen.queryByRole('tab', { name: /Changes/ })).not.toBeInTheDocument();
  });

  it('keeps the page identity visible when no Schema identities exist', () => {
    render(<SchemaRegistry defaultFamilyId="missing_family" families={[]} />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText('No Schema matches the current library selection.')
    ).toBeInTheDocument();
  });
});
