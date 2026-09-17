// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaStudioExperience } from '@/components/schemas/SchemaStudioExperience';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  data: undefined as unknown,
  workspaces: [] as Array<{
    id: string;
    revision?: number;
    status: string;
    targetBranch: string;
    title: string;
  }>,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('candidate=provider'),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({
    items: [
      {
        id: 'provider',
        available: true,
        title: 'Shared foundation',
        kind: 'module',
        source: { canonicalName: 'team/base', version: '1.0', hash: 'sha256:abc' },
      },
    ],
    loading: false,
  }),
}));
vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({ refresh: vi.fn(), workspaces: mocks.workspaces }),
}));
vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useApplyStudioSelection: () => mocks.apply,
  useStudioPreview: () => ({ data: mocks.data, loading: false, refresh: vi.fn() }),
}));
beforeEach(() => {
  mocks.apply.mockReset();
  mocks.workspaces = [];
  mocks.data = {
    samples: [],
    schema: { nodes: {} },
    schemaHash: 'definition-hash',
    reviewHash: 'review',
    renderPlan: [],
    origins: {},
    modules: [{ candidateId: 'provider', requiredBy: ['team/consumer'] }],
    report: {
      valid: false,
      issues: [
        { code: 'REQUIRED_IMPORT_MISSING', message: 'Missing service capability', blocking: true },
      ],
    },
    adoption: { allowed: true },
    workspace: { id: 'target', revision: 2, changes: [] },
  };
});
it('keeps a required provider checked and locked while blocking a failed definition review', () => {
  render(<SchemaStudioExperience projectId="p" />);
  const controls = screen.getByRole('toolbar', { name: 'Studio controls' });
  const composition = screen.getByRole('main', { name: 'Studio composition' });
  const sources = screen.getByRole('complementary', { name: 'Studio sources' });
  expect(composition).toContainElement(controls);
  expect(sources).toHaveClass('col-start-1', 'row-span-2', 'row-start-1');
  expect(controls).toHaveClass('col-span-2', 'col-start-2', 'row-start-1');
  expect(screen.getByRole('region', { name: 'Composed structure' })).toHaveClass(
    'col-start-2',
    'row-start-2'
  );
  expect(screen.getByRole('complementary', { name: 'Module details' })).toHaveClass(
    'col-start-3',
    'row-start-2'
  );
  expect(
    within(controls).getByRole('button', { name: 'Advanced definition workbench' })
  ).toBeVisible();
  expect(within(controls).getByRole('button', { name: 'Review changes' })).toBeVisible();
  expect(screen.getByLabelText('Target Workspace').closest('label')).toHaveClass(
    'h-[34px]',
    'rounded-[5px]'
  );
  expect(screen.getByRole('button', { name: 'Check schema' })).toHaveClass(
    'h-[34px]',
    'rounded-[5px]'
  );
  expect(screen.getByRole('button', { name: 'Review & apply' })).toHaveClass(
    'h-[34px]',
    'rounded-[5px]'
  );
  expect(screen.getByRole('button', { name: 'Zoom out' }).parentElement).toHaveClass(
    'h-[34px]',
    'rounded-[5px]'
  );
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove Shared foundation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review & apply' })).toBeDisabled();
  expect(screen.getByText('Missing service capability')).toBeVisible();
  expect(screen.getByText('Not run')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('does not offer the selected candidate as its own comparison', () => {
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.queryByRole('option', { name: 'Shared foundation · 1.0' })).not.toBeInTheDocument();
  expect(screen.getByText('Create a Workspace to review and apply this definition.')).toBeVisible();
});

it('selects the only draft workspace once instead of duplicating Main workspace', () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  render(<SchemaStudioExperience projectId="p" />);
  const select = screen.getByLabelText('Target Workspace');
  expect(select.querySelectorAll('option')).toHaveLength(1);
  expect(select).toHaveValue('workspace_branch:main');
  expect(select).toHaveTextContent('Main workspace');
});
