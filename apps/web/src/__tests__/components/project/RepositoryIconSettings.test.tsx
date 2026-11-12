// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RepositoryIconSettings } from '@/components/project/settings/RepositoryIconSettings';

it('retains a rejected icon selection and submits a separate default reset', async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error('Update rejected'))
    .mockResolvedValue(null);
  render(
    <RepositoryIconSettings
      projectId="p"
      name="Example"
      icon={{ key: 'database', color: 'rose' }}
      canEdit
      onSave={onSave}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change icon' }));
  const save = screen.getByRole('button', { name: 'Save icon' });
  expect(save).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'flask' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Color' }), { target: { value: 'teal' } });
  fireEvent.click(save);
  expect((await screen.findByRole('alert')).textContent).toBe('Update rejected');
  expect(screen.getByRole('button', { name: 'flask' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('combobox', { name: 'Color' })).toHaveProperty('value', 'teal');
  expect(onSave).toHaveBeenNthCalledWith(1, { key: 'flask', color: 'teal' });

  fireEvent.click(screen.getByRole('button', { name: 'Default' }));
  fireEvent.click(save);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onSave).toHaveBeenNthCalledWith(2, null);
});
