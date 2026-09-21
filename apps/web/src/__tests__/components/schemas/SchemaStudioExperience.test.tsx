// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaStudioExperience } from '@/components/schemas/SchemaStudioExperience';

const mocks = vi.hoisted(() => ({ data: undefined as unknown, apply: vi.fn() }));
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
  useProjectWorkspaces: () => ({ workspaces: [], refresh: vi.fn() }),
}));
vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useApplyStudioSelection: () => mocks.apply,
  useStudioPreview: () => ({ data: mocks.data, loading: false, refresh: vi.fn() }),
}));
beforeEach(() => {
  mocks.apply.mockReset();
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

it('opens the module workbench in a wide viewport-bounded dialog with a scrollable body', () => {
  render(
    <SchemaStudioExperience projectId="p">
      <div>Module workbench content</div>
    </SchemaStudioExperience>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Advanced definition workbench' }));
  const dialog = screen.getByRole('dialog', { name: 'Add modules' });
  expect(dialog).toHaveClass(
    'sm:max-w-[min(1100px,calc(100%-2rem))]',
    'max-h-[90dvh]',
    'overflow-hidden'
  );
  expect(dialog).not.toHaveClass('sm:max-w-lg');
  expect(within(dialog).getByText('Module workbench content').parentElement).toHaveClass(
    'min-h-0',
    'min-w-0',
    'overflow-auto'
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
});
