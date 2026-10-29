// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SchemaSourceCompositionDialog } from '@/components/schemas/SchemaSourceCompositionDialog';

const fixture = vi.hoisted(() => ({ valid: true }));
vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useStudioPreview: () => ({
    data: {
      schemaHash: 'base',
      schema: { name: 'new', nodes: { tasks: { slots: { title: { type: 'boolean' } } } } },
      compositionConflicts: [],
      report: { valid: fixture.valid, issues: [] },
    },
    loading: false,
  }),
}));
it('requires a decision before rebasing an overlapping field edit', async () => {
  fixture.valid = true;
  const save = vi.fn().mockResolvedValue(undefined),
    close = vi.fn();
  render(
    <SchemaSourceCompositionDialog
      projectId="p"
      workspaceId="w"
      candidates={[]}
      selection={['a', 'b']}
      baseDefinition={{ nodes: { tasks: { slots: { title: { type: 'string' } } } } }}
      currentDefinition={{
        nodes: { tasks: { slots: { title: { type: 'number' }, due_date: { type: 'string' } } } },
      }}
      onSave={save}
      onClose={close}
    />
  );
  expect(screen.getByRole('button', { name: 'Save combined draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep my changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save combined draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]![3]).toEqual({
    name: 'new',
    nodes: { tasks: { slots: { title: { type: 'number' }, due_date: { type: 'string' } } } },
  });
  expect(close).toHaveBeenCalled();
});
it('keeps unresolved source checks from saving and supports cancelling without mutation', () => {
  fixture.valid = false;
  const save = vi.fn(),
    close = vi.fn();
  render(
    <SchemaSourceCompositionDialog
      projectId="p"
      workspaceId="w"
      candidates={[]}
      selection={['a']}
      onSave={save}
      onClose={close}
    />
  );
  expect(screen.getByRole('button', { name: 'Save combined draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
