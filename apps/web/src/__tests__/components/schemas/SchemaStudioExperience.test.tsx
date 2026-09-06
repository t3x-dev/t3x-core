// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
