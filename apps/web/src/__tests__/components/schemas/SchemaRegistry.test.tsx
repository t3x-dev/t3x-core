// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SchemaRegistry } from '@/components/schemas';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';

function renderRegistry(projectId = 'proj_test') {
  return render(<SchemaRegistry {...getSchemaRegistryPreview(projectId)} />);
}

describe('SchemaRegistry', () => {
  it('shows PRD and Skill as selectable Schema families with independent current versions', () => {
    renderRegistry();

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Schema families' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PRD Schema v2/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /Skill Schema v1/i })).toBeInTheDocument();
    expect(screen.getByText('2 families')).toBeInTheDocument();
    expect(screen.getByText('8 contract paths')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('switches to the Skill family and exposes its structured nodes and typed relations', () => {
    renderRegistry();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Skill Schema v1/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getAllByText('Skill Schema v1')).toHaveLength(2);
    expect(screen.getByText('24 contract paths')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Relations' })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Relations' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByText('6 relation types')).toBeInTheDocument();
    expect(screen.getByText('has_step')).toBeInTheDocument();
    expect(screen.getByText('checks/*')).toBeInTheDocument();
    expect(screen.getAllByText('workflows/*')).not.toHaveLength(0);
  });

  it('remembers each family version selection while resetting the detail view', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Skill Schema v1/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Relations' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /PRD Schema v2/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByRole('radio', { name: /v1 Historical/i })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Relations' })).not.toBeInTheDocument();
  });

  it('switches versions, resets to Structure, and compares against current v2', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v3 Draft/i }));

    expect(screen.getByText('PRD Schema v3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('9 contract paths')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compare with v2' }));

    expect(screen.getByRole('tab', { name: 'Changes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('v3 compared with current v2')).toBeInTheDocument();
    expect(screen.getByText('requirements.*.evidence')).toBeInTheDocument();
  });

  it('opens canonical YAML for the selected family and version', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open PRD Schema v1 canonical YAML' }));

    expect(screen.getByRole('tab', { name: 'Canonical YAML' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('t3x/prd@v1')).toBeInTheDocument();
    expect(screen.getByText(/version: 1/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v1 Historical/i })).toBeChecked();
  });

  it('does not infer current from release order or an active status', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const prdFamily = preview.families[0];

    render(
      <SchemaRegistry
        defaultFamilyId="prd"
        families={[{ ...prdFamily, currentReleaseId: 'missing_release' }]}
      />
    );

    const currentVersionFact = screen.getByText('Current version').parentElement;
    expect(currentVersionFact).toHaveTextContent('Not set');
    expect(screen.getByRole('radio', { name: /v3 Draft/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /v2 Published/i })).not.toBeChecked();
  });

  it('only enables comparison when its recorded baseline matches current', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const prdFamily = preview.families[0];
    const releases = prdFamily.releases.map((release) =>
      release.id === 'schema_prd_v3'
        ? { ...release, changesBaseReleaseId: 'schema_prd_v1' }
        : release
    );

    render(<SchemaRegistry defaultFamilyId="prd" families={[{ ...prdFamily, releases }]} />);
    fireEvent.click(screen.getByRole('radio', { name: /v3 Draft/i }));

    expect(screen.queryByRole('button', { name: /Compare with/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('Comparison unavailable')).toBeInTheDocument();
    expect(screen.getByText(/recorded against a different baseline/)).toBeInTheDocument();
  });

  it('keeps the page identity and action state visible when no families exist', () => {
    render(<SchemaRegistry defaultFamilyId="missing_family" families={[]} />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText('No schema families are available for this project.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canonical YAML' })).toBeDisabled();
  });
});
