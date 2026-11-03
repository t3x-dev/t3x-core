// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RepositoryDescriptionEditor } from '@/components/project/RepositoryDescriptionEditor';

it('keeps a failed edit available for retry and saves only on submission', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValue(undefined);
  render(<RepositoryDescriptionEditor description="Original" onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit repository description' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository description' }), {
    target: { value: '  Updated  ' },
  });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save description' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(screen.getByRole('textbox')).toHaveValue('  Updated  ');
  fireEvent.click(screen.getByRole('button', { name: 'Save description' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(save).toHaveBeenLastCalledWith('Updated');
});

it('discards canceled edits and opens with the latest description', () => {
  const save = vi.fn();
  const view = render(<RepositoryDescriptionEditor description="Original" onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit repository description' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Canceled' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(save).not.toHaveBeenCalled();
  view.rerender(<RepositoryDescriptionEditor description="Latest" onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit repository description' }));
  expect(screen.getByRole('textbox')).toHaveValue('Latest');
});
