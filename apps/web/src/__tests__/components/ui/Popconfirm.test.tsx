// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Popconfirm } from '@/components/ui/popconfirm';

it('allows cancellation without applying the change and confirms exactly once', () => {
  const onConfirm = vi.fn<() => undefined>();
  render(
    <Popconfirm
      title="Clear the filter?"
      description="All rows will become visible."
      confirmLabel="Clear"
      onConfirm={onConfirm}
    >
      <button type="button">Clear filter</button>
    </Popconfirm>
  );
  const trigger = screen.getByRole('button', { name: 'Clear filter' });
  fireEvent.click(trigger);
  const confirmation = screen.getByRole('dialog', { name: 'Clear the filter?' });
  expect(confirmation).toHaveAccessibleDescription('All rows will become visible.');
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(confirmation).not.toBeInTheDocument();

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Clear', exact: true }));
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
