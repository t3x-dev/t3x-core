// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRenderView } from '@/components/workspaces/WorkspaceRenderView';
import type { ReviewCheckView } from '@/domain/workspaces/reviewCheckPresentation';

const rows = [
  {
    depth: 0,
    expandable: true,
    id: 'workspace',
    key: 'workspace',
    parentPath: null,
    path: 'workspace',
    type: 'object',
    value: 'Main workspace',
  },
  {
    depth: 1,
    expandable: false,
    id: 'tagline',
    key: 'tagline',
    parentPath: 'workspace',
    path: 'workspace/tagline',
    type: 'string',
    value: 'Internal canary rollout',
  },
  {
    afterValue: 'Service checkout-api currently has replicas 4',
    changed: true,
    changeKind: 'modified' as const,
    depth: 1,
    expandable: false,
    id: 'summary',
    key: 'summary',
    parentPath: 'workspace',
    path: 'workspace/summary/outcome',
    reason: 'Updated desired outcome',
    type: 'string',
    value: 'Service checkout-api currently has replicas 4',
  },
  {
    changed: true,
    depth: 1,
    expandable: true,
    id: 'rollout',
    key: 'rollout',
    parentPath: 'workspace',
    path: 'workspace/rollout',
    type: 'object',
    value: '-',
  },
  {
    depth: 2,
    expandable: false,
    id: 'stage',
    key: 'stage',
    parentPath: 'workspace/rollout',
    path: 'workspace/rollout/stage',
    type: 'string',
    value: 'internal-preview',
  },
  {
    depth: 2,
    expandable: false,
    id: 'audience',
    key: 'audience',
    parentPath: 'workspace/rollout',
    path: 'workspace/rollout/audience',
    type: 'string',
    value: 'internal-team',
  },
  {
    depth: 2,
    expandable: false,
    id: 'allocation',
    key: 'allocation',
    parentPath: 'workspace/rollout',
    path: 'workspace/rollout/allocation',
    type: 'string',
    value: '10%',
  },
  {
    depth: 1,
    expandable: false,
    id: 'purpose',
    key: 'purpose',
    parentPath: 'workspace',
    path: 'workspace/purpose',
    type: 'string',
    value: 'Review every rollout decision.',
  },
  {
    afterValue: 'true',
    changed: true,
    depth: 1,
    expandable: false,
    id: 'rollback_readiness',
    key: 'rollback_readiness',
    parentPath: 'workspace',
    path: 'workspace/rollback_readiness',
    type: 'boolean',
    value: 'true',
  },
  {
    depth: 1,
    expandable: true,
    id: 'requirements',
    key: 'requirements',
    parentPath: 'workspace',
    path: 'workspace/requirements',
    type: 'object',
    value: '-',
  },
  {
    depth: 2,
    expandable: false,
    id: 'monitoring',
    key: 'monitoring_enabled',
    parentPath: 'workspace/requirements',
    path: 'workspace/requirements/monitoring_enabled',
    type: 'boolean',
    value: 'true',
  },
  {
    depth: 2,
    expandable: false,
    id: 'oncall',
    key: 'oncall_coverage',
    parentPath: 'workspace/requirements',
    path: 'workspace/requirements/oncall_coverage',
    type: 'boolean',
    value: 'true',
  },
  {
    depth: 1,
    expandable: false,
    id: 'notes',
    key: 'notes',
    parentPath: 'workspace',
    path: 'workspace/notes',
    type: 'string',
    value: 'Expand access only after the internal review is complete ...',
  },
];

const pendingChecks: ReviewCheckView[] = [
  {
    detail: 'Apply the YOps draft to the exact base and verify the resulting State.',
    id: 'replay',
    label: 'Deterministic replay',
    requirement: 'required',
    status: 'pending',
  },
  {
    detail: 'Check the projected result against the Workspace schema and bound context.',
    id: 'schema',
    label: 'Schema validation',
    requirement: 'required',
    status: 'pending',
  },
  {
    detail: 'Protocol object integrity will be checked when the review snapshot is prepared.',
    id: 'integrity',
    label: 'Object integrity',
    requirement: 'system',
    status: 'pending',
  },
  {
    detail: 'Required external statement for this draft.',
    id: 'runner',
    label: 'T3X Action',
    requirement: 'action',
    runLabel: 'Run T3X Action',
    runnable: true,
    status: 'pending',
  },
];

describe('WorkspaceRenderView', () => {
  it('renders workspace data with TARGET review chrome and honest checks', () => {
    const onOpenStructureDiff = vi.fn();
    const onAskAiToRevise = vi.fn();
    const onRunAction = vi.fn();
    const onCommit = vi.fn();
    render(
      <WorkspaceRenderView
        acceptAllowed={false}
        checks={pendingChecks}
        commitEnabled={false}
        draftLabel="v2117046"
        onAskAiToRevise={onAskAiToRevise}
        onCommit={onCommit}
        onOpenStructureDiff={onOpenStructureDiff}
        onRunAction={onRunAction}
        onSelectRow={vi.fn()}
        rows={rows}
        selectedRowId="summary"
        source={{ label: 'Main workspace source chat' }}
        subtitle="Collect source evidence and build the next structured state commit."
        title="Main workspace"
        whyText="Updated desired outcome"
      />
    );

    expect(screen.getByText('Rendered result - Main workspace v2117046')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main workspace' })).toBeInTheDocument();
    expect(screen.getByText('Internal canary rollout')).toBeInTheDocument();
    expect(screen.queryByText(/Collect source evidence/)).not.toBeInTheDocument();
    expect(screen.queryByText('Release plan')).not.toBeInTheDocument();
    expect(screen.getAllByText('Updated').length).toBeGreaterThan(0);
    expect(screen.getByText('Service checkout-api currently has replicas 4')).toBeInTheDocument();
    expect(screen.getByText('Review every rollout decision.')).toBeInTheDocument();
    expect(screen.getByText('internal-preview')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Monitoring enabled')).toBeInTheDocument();
    expect(screen.getByText('Oncall coverage')).toBeInTheDocument();
    expect(screen.getByText('Selected section')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Show in structure diff')).toBeInTheDocument();
    expect(screen.getByText('Ask AI to revise')).toBeInTheDocument();
    expect(screen.getByText('Checks for draft v2117046')).toBeInTheDocument();
    expect(screen.getByText('Deterministic replay')).toBeInTheDocument();
    expect(screen.getByText('Schema validation')).toBeInTheDocument();
    expect(screen.getAllByText('Not run')).toHaveLength(3);
    expect(screen.queryByText('Object integrity')).not.toBeInTheDocument();
    expect(screen.queryByText('Run checks')).not.toBeInTheDocument();
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run T3X Action' })).toBeInTheDocument();
    expect(
      screen.getByText('Results tied to this draft; edits require recheck.')
    ).toBeInTheDocument();
    expect(screen.getByText('Required action has not run.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit changes' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Open structure diff' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI to revise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run T3X Action' }));
    expect(onOpenStructureDiff).toHaveBeenCalled();
    expect(onAskAiToRevise).toHaveBeenCalled();
    expect(onRunAction).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows Passed pills without faking a required action', () => {
    render(
      <WorkspaceRenderView
        acceptAllowed
        checks={[
          {
            detail: 'All changes can be replayed successfully.',
            id: 'replay',
            label: 'Deterministic replay',
            requirement: 'required',
            status: 'passed',
          },
          {
            detail: 'Draft conforms to Workspace schema schema.',
            id: 'schema',
            label: 'Schema validation',
            requirement: 'required',
            status: 'passed',
          },
        ]}
        commitEnabled
        draftLabel="draft"
        onAskAiToRevise={vi.fn()}
        onCommit={vi.fn()}
        onOpenStructureDiff={vi.fn()}
        onSelectRow={vi.fn()}
        rows={rows}
        selectedRowId="summary"
        source={{ label: 'Source chat' }}
        subtitle="Collect source evidence and build the next structured state commit."
        title="Main workspace"
        whyText="Updated desired outcome"
      />
    );

    expect(screen.getAllByText('Passed')).toHaveLength(2);
    expect(screen.queryByText('T3X Action')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit changes' })).toBeEnabled();
  });

  it('uses a bound schema name as the document title', () => {
    render(
      <WorkspaceRenderView
        acceptAllowed
        checks={[]}
        commitEnabled={false}
        draftLabel="v3"
        onAskAiToRevise={vi.fn()}
        onCommit={vi.fn()}
        onOpenStructureDiff={vi.fn()}
        onSelectRow={vi.fn()}
        rows={rows}
        schemaLabel="Release plan Schema"
        selectedRowId="summary"
        source={{ label: 'Source chat' }}
        subtitle="Collect source evidence and build the next structured state commit."
        title="Main workspace"
        whyText="Updated desired outcome"
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Release plan' })).toBeInTheDocument();
    expect(screen.getByText('Rendered result - Release plan v3')).toBeInTheDocument();
    expect(screen.getByText('Internal canary rollout')).toBeInTheDocument();
    expect(screen.queryByText(/Collect source evidence/)).not.toBeInTheDocument();
  });

  it('keeps a sparse workspace reader from duplicating summary as a requirement check', () => {
    render(
      <WorkspaceRenderView
        acceptAllowed={false}
        checks={[]}
        commitEnabled={false}
        draftLabel="v2117046"
        onAskAiToRevise={vi.fn()}
        onCommit={vi.fn()}
        onOpenStructureDiff={vi.fn()}
        onSelectRow={vi.fn()}
        rows={[
          {
            depth: 0,
            expandable: true,
            id: 'workspace',
            key: 'workspace',
            parentPath: null,
            path: 'workspace',
            type: 'object',
            value: 'Main workspace',
          },
          {
            afterValue: 'Service checkout-api currently has replicas 4',
            changed: true,
            depth: 1,
            expandable: false,
            id: 'summary',
            key: 'summary',
            parentPath: 'workspace',
            path: 'workspace/summary',
            type: 'string',
            value: 'Service checkout-api currently has replicas 4',
          },
          {
            changed: true,
            depth: 1,
            expandable: true,
            id: 'requirements',
            key: 'requirements',
            parentPath: 'workspace',
            path: 'workspace/requirements',
            type: 'object',
            value: '1 item',
          },
          {
            changed: true,
            depth: 2,
            expandable: false,
            id: 'req0',
            key: '0',
            parentPath: 'workspace/requirements',
            path: 'workspace/requirements/0',
            type: 'string',
            value: 'Service checkout-api currently has replicas 4',
          },
        ]}
        selectedRowId="summary"
        source={{ label: 'Source chat' }}
        subtitle="Collect source evidence and build the next structured state commit."
        title="Main workspace"
        whyText=""
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Main workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/Collect source evidence/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Service checkout-api currently has replicas 4')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Requirements' })).not.toBeInTheDocument();
  });
});
