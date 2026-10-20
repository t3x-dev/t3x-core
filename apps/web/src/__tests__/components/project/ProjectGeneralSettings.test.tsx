// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectGeneralSettings } from '@/components/project/settings/ProjectGeneralSettings';
import type { ProjectDetail } from '@/types/api';

const mocks = vi.hoisted(() => ({ checkName: vi.fn(), toastSuccess: vi.fn() }));
vi.mock('@/queries/projects', () => ({ checkRepositoryName: mocks.checkName }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

const project = {
  project_id: 'proj_settings',
  namespace: 'team',
  name: 'demo',
  created_at: '2026-10-20T00:00:00Z',
  metadata: { description: 'Original description' },
} as ProjectDetail;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkName.mockImplementation(async (namespace: string, name: string) => ({
    name,
    canonical_path: `/${namespace}/${name}`,
    changed: false,
    available: name !== 'taken',
    message: name === 'taken' ? 'This repository name is already in use.' : undefined,
  }));
});

it('shows rename feedback when editing, blocks an unavailable name, and clears it on discard', async () => {
  const onSave = vi.fn();
  render(<ProjectGeneralSettings project={project} onSave={onSave} />);
  await waitFor(() => expect(mocks.checkName).toHaveBeenCalled());
  expect(screen.queryByText(/Final repository name/)).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: 'Repository name' }), {
    target: { value: 'taken' },
  });
  expect(screen.getByText('Checking name and availability…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This repository name is already in use.'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.getByRole('textbox', { name: 'Repository name' })).toHaveValue('demo');
  expect(screen.queryByText(/Final repository name/)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

it('can save a description without renaming and keeps a failed save visible for retry', async () => {
  mocks.checkName.mockRejectedValue(new Error('Name check is offline'));
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Could not save repository details.'));
  render(<ProjectGeneralSettings project={project} onSave={onSave} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: 'Updated description' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save repository details.');
  expect(onSave).toHaveBeenCalledWith({ name: 'demo', description: 'Updated description' });
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Updated description');

  onSave.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Repository details saved'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
