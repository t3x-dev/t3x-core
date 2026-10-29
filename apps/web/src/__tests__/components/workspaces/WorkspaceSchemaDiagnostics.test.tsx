// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceSchemaDiagnostics } from '@/components/workspaces/WorkspaceSchemaDiagnostics';

const mocks = vi.hoisted(() => ({ read: vi.fn(), query: '' }));
const requests = { read: mocks.read };
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock('@/hooks/workspaces/useWorkspaceSchemaEditingRequests', () => ({
  useWorkspaceSchemaEditingRequests: () => requests,
}));
const diagnostics = {
  schemaHash: 'schema-hash',
  reviewHash: 'review-hash',
  sources: [],
  adoption: { allowed: false, reason: 'Source access revoked' },
  report: {
    valid: false,
    issues: [],
    layers: [
      {
        id: 'provenance',
        label: 'Source authorization',
        status: 'failed',
        issues: [{ code: 'REVOKED', message: 'Source access revoked', blocking: true }],
      },
    ],
  },
  impact: {
    status: 'needs_mapping',
    canAdopt: false,
    canPublish: false,
    changes: [{ kind: 'REMOVE', path: 'nodes.old', summary: 'Removed node' }],
    items: [
      {
        kind: 'needs_mapping',
        code: 'MAPPING',
        path: 'nodes.old',
        message: 'Map existing content',
        affectedPaths: ['old/title'],
      },
    ],
    content: {
      source: 'authoring_ledger',
      hash: 'content-hash',
      valid: false,
      ready: false,
      issues: [],
    },
  },
};
beforeEach(() => {
  mocks.read.mockReset();
  mocks.query = '';
});
it('opens from Run, displays all blocking diagnostics and refreshes without applying', async () => {
  mocks.query = 'schemaDiagnostics=1';
  mocks.read.mockResolvedValue({ workspace: { revision: 3 }, preview: diagnostics });
  render(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" revision={3} />);
  expect(await screen.findByText('Source authorization')).toBeVisible();
  expect(screen.getAllByText('Source access revoked').length).toBeGreaterThan(0);
  expect(screen.getByText('Map existing content')).toBeVisible();
  fireEvent.click(screen.getByText('Affected content · 1'));
  expect(screen.getByText('old/title')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh checks' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
});
it('renders frozen preparation evidence without reading the current candidate', () => {
  mocks.query = 'schemaDiagnostics=1';
  const review = {
    preparationDiagnostics: [{ workspaceRevision: 3, diagnostics }],
  } as unknown as WorkspaceFullSchemaReview;
  render(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" frozen review={review} />);
  expect(screen.getByText('Before content adaptation · Draft r3')).toBeVisible();
  expect(screen.getByText('Source authorization')).toBeVisible();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Refresh checks' })).not.toBeInTheDocument();
});
it('does not invent diagnostics for an old snapshot', () => {
  mocks.query = 'schemaDiagnostics=1';
  render(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" frozen />);
  expect(screen.getByText(/No Schema preparation diagnostics were recorded/)).toBeVisible();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects a concurrent Draft revision and ignores a response after closing', async () => {
  mocks.query = 'schemaDiagnostics=1';
  mocks.read.mockResolvedValueOnce({ workspace: { revision: 4 }, preview: diagnostics });
  render(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" revision={3} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('The Draft changed');
  let resolve: (value: unknown) => void = () => {};
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh checks' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await act(async () => resolve({ workspace: { revision: 3 }, preview: diagnostics }));
  expect(screen.queryByText('Source authorization')).not.toBeInTheDocument();
});

it('preserves explicit source selection from Schema, including an empty selection', async () => {
  mocks.query = 'schemaDiagnostics=1&schemaSelection=1&schemaSource=source%3Aa%2Bb';
  mocks.read.mockResolvedValue({ workspace: { revision: 3 }, preview: diagnostics });
  const view = render(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" revision={3} />);
  await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith(['source:a+b']));
  mocks.query = 'schemaDiagnostics=1&schemaSelection=1';
  view.rerender(<WorkspaceSchemaDiagnostics projectId="p" workspaceId="w" revision={3} />);
  await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith([]));
});
