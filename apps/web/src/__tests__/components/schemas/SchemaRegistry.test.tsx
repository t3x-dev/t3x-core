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
  it('shows one schema family with its explicit current version and contract structure', () => {
    renderRegistry();

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Schema versions' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected schema version' })).toBeInTheDocument();
    expect(screen.getByText('single family')).toBeInTheDocument();
    expect(screen.getByText('2 workspaces')).toBeInTheDocument();
    expect(screen.getByText('8 contract paths')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
    expect(screen.queryByText('Docker Compose')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));

    expect(screen.getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('PRD Schema v1')).toBeInTheDocument();
  });

  it('opens the explicit current canonical YAML from any selected version', () => {
    renderRegistry();

    fireEvent.click(screen.getByRole('radio', { name: /v1 Historical/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open current v2 canonical YAML' }));

    expect(screen.getByRole('tab', { name: 'Canonical YAML' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('t3x/prd@v2')).toBeInTheDocument();
    expect(screen.getByText(/version: 2/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('shows an explicit empty comparison for the current version', () => {
    renderRegistry();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByText('0 changes')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This is the current version. Select another version to compare its contract with v2.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /workspace|default|create/i })
    ).not.toBeInTheDocument();
  });

  it('does not infer current from release order or an active status', () => {
    const preview = getSchemaRegistryPreview('proj_test');

    render(
      <SchemaRegistry
        currentReleaseId="missing_release"
        releases={[preview.releases[0], preview.releases[1], preview.releases[2]]}
      />
    );

    const currentVersionFact = screen.getByText('Current version').parentElement;
    expect(currentVersionFact).toHaveTextContent('Not set');
    expect(screen.getByRole('radio', { name: /v3 Draft/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /v2 Published/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Open current canonical YAML' })).toBeDisabled();
  });

  it('only enables comparison when its recorded baseline matches current', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const releases = preview.releases.map((release) =>
      release.id === 'schema_prd_v3'
        ? { ...release, changesBaseReleaseId: 'schema_prd_v1' }
        : release
    );

    render(<SchemaRegistry currentReleaseId={preview.currentReleaseId} releases={releases} />);
    fireEvent.click(screen.getByRole('radio', { name: /v3 Draft/i }));

    expect(screen.queryByRole('button', { name: /Compare with/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('Comparison unavailable')).toBeInTheDocument();
    expect(screen.getByText(/recorded against a different baseline/)).toBeInTheDocument();
  });

  it('keeps the page identity and action state visible when no versions exist', () => {
    render(<SchemaRegistry currentReleaseId="missing_release" releases={[]} />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText('No schema versions are available for this project.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open current canonical YAML' })).toBeDisabled();
  });
});
