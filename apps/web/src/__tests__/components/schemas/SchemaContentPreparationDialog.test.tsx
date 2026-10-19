// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  prepared: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@/infrastructure/schemaStudio', () => ({
  previewSchemaContentPreparation: mocks.preview,
  applySchemaContentPreparation: mocks.apply,
}));
const hash = `sha256:${'a'.repeat(64)}`;
const target = { kind: 'pending' as const, pendingId: hash };
const command = [{ kind: 'move', from: 'candidate/requirements', to: 'candidate/features' }];
const preview = (ready = false) => ({
  previewHash: hash,
  workspaceRevision: 3,
  schemaHash: hash,
  compositionRevision: 2,
  refHead: null,
  rootKey: 'candidate',
  schema: { nodes: {} },
  before: { candidate: { requirements: { title: 'Edited content' } } },
  after: { candidate: { features: { title: 'Edited content' } } },
  operations: [{ assert: { path: 'candidate' } }],
  impact: { items: [{ kind: 'needs_mapping', path: 'nodes.requirements' }] },
  valid: true,
  ready,
  canPrepare: ready,
  issues: ready
    ? []
    : [{ code: 'MAPPING_REQUIRED', path: 'nodes.requirements', message: 'Map existing content' }],
});
const props = {
  projectId: 'p',
  workspaceId: 'w',
  revision: 3,
  target,
  open: true,
  onOpenChange: mocks.close,
  onPrepared: mocks.prepared,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockImplementation(async (_p, _w, input) => preview(input.commands.length > 0));
  mocks.apply.mockResolvedValue({ outcome: 'prepared' });
});
it('previews explicit mappings and invalidates approval as soon as the input changes', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Content migration commands')).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Content migration commands'), {
    target: { value: JSON.stringify(command) },
  });
  fireEvent.click(
    screen.getByRole('checkbox', { name: /My commands explicitly handle nodes.requirements/ })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeEnabled()
  );
  expect(mocks.preview).toHaveBeenLastCalledWith('p', 'w', {
    target,
    ifRevision: 3,
    commands: command,
    confirmedChanges: ['nodes.requirements'],
  });
  fireEvent.change(screen.getByLabelText('Content migration commands'), {
    target: { value: '[]' },
  });
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(false);
});
it('retries a lost response with the same request identity and saves through the atomic endpoint only', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Content migration commands')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Content migration commands'), {
    target: { value: JSON.stringify(command) },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /My commands explicitly handle/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeEnabled()
  );
  mocks.apply.mockRejectedValueOnce(new Error('Connection lost'));
  fireEvent.click(screen.getByRole('button', { name: 'Save prepared Draft' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Connection lost'));
  fireEvent.click(screen.getByRole('button', { name: 'Save prepared Draft' }));
  await waitFor(() => expect(mocks.prepared).toHaveBeenCalledTimes(1));
  expect(mocks.apply.mock.calls[0]).toEqual(mocks.apply.mock.calls[1]);
  expect(mocks.apply.mock.calls[0]).toMatchObject([
    'p',
    'w',
    {
      target,
      commands: command,
      confirmedChanges: ['nodes.requirements'],
      ifRevision: 3,
      previewHash: hash,
    },
  ]);
});
it('discards delayed responses from another Workspace revision and invalidates approval on focus', async () => {
  let finishOld!: (value: unknown) => void;
  mocks.preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  const { rerender } = render(<SchemaContentPreparationDialog {...props} />);
  rerender(<SchemaContentPreparationDialog {...props} revision={4} />);
  await waitFor(() => expect(screen.getByLabelText('Content migration commands')).toBeEnabled());
  await act(async () => finishOld({ ...preview(), before: { wrong: 'old' } }));
  expect(screen.queryByText(/wrong/)).not.toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Preview the migration again');
});
