// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspacePreviewView } from '@/components/workspaces/WorkspacePreviewView';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

const candidate: WorkspaceCandidate = {
  ...getProjectWorkspaceStarterCandidate('test'),
  schemaBindings: [
    { rootKey: 'services', schemaName: 'Service config', version: '1', mode: 'pinned' },
  ],
  sourceBundle: [
    {
      id: 'note',
      type: 'text',
      title: 'Scaling request',
      previewText: 'Scale the API to three replicas.',
    },
  ],
  yopsDraft: {
    id: 'draft',
    operations: [
      {
        id: 'scale',
        op: 'set',
        path: 'api/replicas',
        summary: 'Scale API',
        afterValue: 3,
        reason: 'Handle the additional load.',
        sourceRefs: ['note'],
      },
    ],
  },
};
const baseline: WorkspaceYOpsTreeNode[] = [
  {
    key: 'services',
    slots: {},
    children: [
      { key: 'api', slots: { replicas: 1, optional: null, enabled: false }, children: [] },
    ],
  },
];
const result: WorkspaceYOpsTreeNode[] = [
  {
    key: 'services',
    slots: {},
    children: [
      { key: 'api', slots: { replicas: 3, optional: null, enabled: false }, children: [] },
    ],
  },
];
const props = {
  appliedCount: 1,
  baselineTrees: baseline,
  candidate,
  operationCount: 1,
  previewReady: true,
  previewTrees: result,
  schemaGapCount: 0,
  validationPassed: true,
  yamlView: <div>Service YAML</div>,
};

describe('WorkspacePreviewView', () => {
  it('shows generic state and ties relative operation paths to their recorded source', () => {
    render(<WorkspacePreviewView {...props} />);
    expect(screen.getByRole('tab', { name: 'Changes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'PRD' })).not.toBeInTheDocument();
    expect(screen.getByText('Handle the additional load.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'T3X Diff' })).getByText('Scaling request')
    ).toBeInTheDocument();
    const nodes = within(screen.getByRole('region', { name: 'Changed nodes' }));
    expect(nodes.getByText('enabled')).toBeInTheDocument();
    expect(nodes.getByText('false')).toBeInTheDocument();
    expect(nodes.getByText('null')).toBeInTheDocument();
    expect(screen.getByText('1 field change')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Rendered YAML' }));
    expect(screen.getByText('Service YAML')).toBeVisible();
  });

  it('does not fabricate an empty baseline when a comparison is unavailable', () => {
    render(<WorkspacePreviewView {...props} baselineTrees={null} />);
    expect(screen.getByText(/Comparison unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'T3X Diff' })).not.toBeInTheDocument();
    expect(screen.getByText('Service YAML')).toBeVisible();
  });
});
