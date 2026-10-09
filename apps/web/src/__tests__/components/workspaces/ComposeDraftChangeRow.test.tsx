// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Hash } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { ComposeDraftChangeRow } from '@/components/workspaces/ComposeDraftChangeRow';

it('shows the exact Base-to-Draft values and separates inspect from direct edit', () => {
  const onSelect = vi.fn();
  const onEdit = vi.fn();
  render(
    <ul>
      <ComposeDraftChangeRow
        operation={{
          id: 'owner',
          path: 'settings/enabled',
          op: 'set',
          beforeValue: false,
          afterValue: true,
          summary: '',
        }}
        Icon={Hash}
        selected={false}
        onSelect={onSelect}
        onEdit={onEdit}
      />
    </ul>
  );
  expect(screen.getByText('false')).toBeInTheDocument();
  expect(screen.getByText('true')).toBeInTheDocument();
  expect(screen.getByText('settings/enabled')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Enabled' }));
  expect(onEdit).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect Enabled: settings/enabled' }));
  expect(onSelect).toHaveBeenCalledOnce();
});

it('keeps an added object together and disables its Edit action', () => {
  const onEdit = vi.fn();
  render(
    <ul>
      <ComposeDraftChangeRow
        operation={{
          id: 'owner',
          path: 'nodes/product',
          op: 'set',
          afterValue: { key: 'product', slots: { title: 'Product' }, children: [] },
          summary: '',
        }}
        Icon={Hash}
        selected
        onSelect={vi.fn()}
        onEdit={onEdit}
      />
    </ul>
  );
  expect(screen.getByText('Added')).toBeInTheDocument();
  expect(screen.getByText('Not present')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit Product' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Product' }));
  expect(onEdit).not.toHaveBeenCalled();
});
