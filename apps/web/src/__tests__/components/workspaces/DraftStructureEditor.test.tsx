// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DraftStructureEditor } from '@/components/workspaces/DraftStructureEditor';

it('offers named additions but not an invalid empty-path root edit', () => {
  render(
    <DraftStructureEditor
      current={{}}
      onEditField={vi.fn()}
      onEditingChange={vi.fn()}
      onPublish={vi.fn()}
      pending={false}
    />
  );
  expect(screen.getByRole('button', { name: 'Add inside root' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Edit root' })).toBeDisabled();
});
