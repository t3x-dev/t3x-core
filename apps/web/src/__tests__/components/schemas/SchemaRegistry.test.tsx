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
  it('shows PRD, Skill, Prompt, and ESPHome Device as selectable Schema families', () => {
    renderRegistry();

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Schema families' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PRD Schema v2/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /Skill Schema v1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Prompt Schema v1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ESPHome Device v1/i })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Schema families' })).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    );
    expect(screen.getByText('4 families')).toBeInTheDocument();
    expect(screen.getByText(/2 nodes · 8 paths/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('switches to the Skill family and exposes its structured nodes and typed relations', () => {
    renderRegistry();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Skill Schema v1/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getAllByText('Skill Schema v1')).toHaveLength(2);
    expect(screen.getByText(/9 nodes · 24 paths/)).toBeInTheDocument();
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

  it('exposes the Prompt structure, relations, executable rules, YAML, and changes views', () => {
    renderRegistry();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Prompt Schema v1/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getAllByText('Prompt Schema v1')).toHaveLength(2);
    const rootFact = screen.getByText('Root').parentElement;
    expect(rootFact).not.toBeNull();
    expect(rootFact).toHaveTextContent('prompt');
    expect(screen.getByText(/11 nodes · 34 paths/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Relations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Canonical YAML' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Changes' })).toBeInTheDocument();

    const messagesToggle = screen.getByRole('button', { name: 'Expand messages.* structure' });
    expect(messagesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('messages.*.template')).not.toBeInTheDocument();
    fireEvent.click(messagesToggle);
    expect(messagesToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('messages.*.template')).toBeInTheDocument();
    expect(screen.getByText('pattern')).toBeInTheDocument();
    expect(screen.getAllByText('executable').length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Rules' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('6 executable')).toBeInTheDocument();
    expect(screen.getByText('prompt.placeholders_declared')).toBeInTheDocument();
    expect(screen.getAllByText('blocking')).toHaveLength(6);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Relations' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('9 relation types')).toBeInTheDocument();
    expect(screen.getByText('uses_output_schema')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Canonical YAML' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('t3x/prompt@v1')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Changes' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('Changes from current')).toBeInTheDocument();
  });

  it('exposes ESPHome Device v1 as a bindable device-state Schema', () => {
    renderRegistry();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /ESPHome Device v1/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getAllByText('ESPHome Device v1')).toHaveLength(2);
    const rootFact = screen.getByText('Root').parentElement;
    expect(rootFact).not.toBeNull();
    expect(rootFact).toHaveTextContent('device');
    expect(screen.getByText(/5 nodes · 8 paths/)).toBeInTheDocument();
    expect(screen.getByText('t3x/esphome-device')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open ESPHome Device v1 canonical YAML' }));

    expect(screen.getByRole('tab', { name: 'Canonical YAML' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('t3x/esphome-device@v1')).toBeInTheDocument();
  });

  it('labels executable and descriptive rules distinctly', () => {
    renderRegistry();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Skill Schema v1/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Rules' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByText('2 executable')).toBeInTheDocument();
    expect(screen.getByText('descriptive')).toBeInTheDocument();
    expect(screen.getByText('skill.generated-trigger-description')).toBeInTheDocument();
  });

  it('binds runtime releases and keeps draft previews view-only', () => {
    const preview = getSchemaRegistryPreview('proj_test');
    const onSetProjectDefault = vi.fn().mockResolvedValue(undefined);
    const onApplyToWorkspace = vi.fn().mockResolvedValue(undefined);
    render(
      <SchemaRegistry
        {...preview}
        bindingActions={{
          onApplyToWorkspace,
          onSetProjectDefault,
          pending: null,
          workspaceTarget: {
            id: 'workspace_main',
            title: 'Main workspace',
          },
        }}
      />
    );

    expect(screen.getByRole('region', { name: 'Schema binding actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use in current & new Workspaces' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    const currentPrd = preview.families[0].releases.find(
      (release) => release.id === preview.families[0].currentReleaseId
    );
    expect(onSetProjectDefault).toHaveBeenCalledWith(currentPrd);
    expect(onApplyToWorkspace).toHaveBeenCalledWith(currentPrd);

    fireEvent.click(screen.getByRole('radio', { name: /v3 Draft/i }));
    expect(screen.getByText('view only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in current & new Workspaces' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply to Main workspace' })).toBeDisabled();
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
    expect(screen.getByText(/2 nodes · 9 paths/)).toBeInTheDocument();

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
