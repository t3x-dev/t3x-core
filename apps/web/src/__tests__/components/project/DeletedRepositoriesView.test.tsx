// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { deleteProject, ProjectPersistenceError, restoreProject } from '@/commands/projects';
import { DeletedRepositoriesView } from '@/components/project/DeletedRepositoriesView';
import { PROJECT_DELETED_EVENT, PROJECT_RESTORED_EVENT } from '@/hooks/shared/deleteEvents';
import { ApiError } from '@/queries/apiErrors';
import { fetchDeletedProjects } from '@/queries/projects';
import { apiProjectToSummary, useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';

vi.mock('@/commands/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/commands/projects')>()),
  deleteProject: vi.fn(),
  restoreProject: vi.fn(),
}));
vi.mock('@/queries/projects', () => ({ fetchDeletedProjects: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const project: Project = {
  project_id: 'original-id',
  name: 'test',
  namespace: 'alice',
  canonical_path: '/alice/test',
  visibility: 'public',
  created_at: '2026-10-10T12:00:00Z',
  deleted_at: '2026-10-19T02:00:00Z',
  can_restore: true,
  can_permanently_delete: true,
};
const rows = (projects: Project[], offset = 0) => ({ projects, offset, limit: 21 });

beforeEach(() => {
  vi.mocked(fetchDeletedProjects)
    .mockReset()
    .mockResolvedValue(rows([project]));
  vi.mocked(restoreProject).mockReset();
  vi.mocked(deleteProject).mockReset();
  useProjectStore.setState({ projects: [], details: {}, initialized: true });
});

it('shows deleted metadata without an inaccessible repository link and respects capabilities', async () => {
  vi.mocked(fetchDeletedProjects).mockResolvedValue(
    rows([{ ...project, can_permanently_delete: false }])
  );
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  expect(await screen.findByText('alice/test')).toBeInTheDocument();
  expect(screen.getByText(/Visibility: public/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Permanently delete' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'test' })).not.toBeInTheDocument();
});

it('restores the same repository only after confirmation, prevents repeats, then offers its canonical link', async () => {
  let finish!: (value: Project) => void;
  vi.mocked(restoreProject).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const event = vi.fn();
  window.addEventListener(PROJECT_RESTORED_EVENT, event);
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Anyone will be able to access');
  expect(restoreProject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Restore repository' }));
  expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
  expect(screen.queryByRole('link', { name: 'Open repository' })).not.toBeInTheDocument();
  vi.mocked(fetchDeletedProjects).mockResolvedValue(rows([]));
  await act(async () => finish({ ...project, deleted_at: null }));
  expect(restoreProject).toHaveBeenCalledExactlyOnceWith('original-id');
  expect(await screen.findByRole('link', { name: 'Open repository' })).toHaveAttribute(
    'href',
    '/alice/test'
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(useProjectStore.getState().initialized).toBe(false);
  expect(event).toHaveBeenCalledOnce();
  window.removeEventListener(PROJECT_RESTORED_EVENT, event);
});

it('requires the exact namespace/name before permanent deletion and clears stale cache on success', async () => {
  const summary = apiProjectToSummary(project);
  useProjectStore.setState({ projects: [summary], details: { [summary.id]: summary } });
  vi.mocked(deleteProject).mockResolvedValue({ deleted: true, project_id: project.project_id });
  const event = vi.fn();
  window.addEventListener(PROJECT_DELETED_EVENT, event);
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Permanently delete' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Old addresses may later point to a different repository'
  );
  const input = screen.getByRole('textbox');
  const confirm = screen.getByRole('button', { name: 'Permanently delete repository' });
  for (const value of ['test', '/alice/test', 'alice/test ']) {
    fireEvent.change(input, { target: { value } });
    expect(confirm).toBeDisabled();
  }
  fireEvent.change(input, { target: { value: 'alice/test' } });
  vi.mocked(fetchDeletedProjects).mockResolvedValue(rows([]));
  fireEvent.click(confirm);
  expect(await screen.findByText(/was permanently deleted/)).toBeInTheDocument();
  expect(deleteProject).toHaveBeenCalledExactlyOnceWith('original-id', {
    permanent: true,
    onlyIfDeleted: true,
  });
  expect(useProjectStore.getState().details['original-id']).toBeUndefined();
  expect(useProjectStore.getState().projects).toEqual([]);
  expect(event).toHaveBeenCalledOnce();
  window.removeEventListener(PROJECT_DELETED_EVENT, event);
});

it('keeps an authoritative failure in the dialog for correction or retry', async () => {
  vi.mocked(restoreProject).mockRejectedValue(
    new ProjectPersistenceError(
      'Denied',
      new ApiError('FORBIDDEN', 'Restore permission was removed.')
    )
  );
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore repository' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Restore permission was removed');
  expect(screen.getByRole('button', { name: 'Restore repository' })).toBeEnabled();
  expect(screen.queryByRole('link', { name: 'Open repository' })).not.toBeInTheDocument();
});

it.each([
  'TIMEOUT',
  'NOT_FOUND',
  'REPOSITORY_STATE_CHANGED',
])('requires a refresh after %s without claiming success', async (code) => {
  vi.mocked(deleteProject).mockRejectedValue(
    new ProjectPersistenceError('Failed', new ApiError(code, 'Failed'))
  );
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Permanently delete' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'alice/test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete repository' }));
  expect(await screen.findByRole('button', { name: 'Refresh list' })).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Permanently delete repository' })
  ).not.toBeInTheDocument();
  vi.mocked(fetchDeletedProjects).mockResolvedValue(rows([]));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
  expect(
    await screen.findByText('No deleted repositories to manage in this namespace.')
  ).toBeInTheDocument();
  expect(screen.queryByText(/was permanently deleted/)).not.toBeInTheDocument();
  expect(deleteProject).toHaveBeenCalledOnce();
});

it('distinguishes loading failures from empty results and retries', async () => {
  vi.mocked(fetchDeletedProjects).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load deleted repositories");
  expect(
    screen.queryByText('No deleted repositories to manage in this namespace.')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('alice/test')).toBeInTheDocument();
});

it('paginates within the namespace and returns to the previous page after removing its last row', async () => {
  const many = Array.from({ length: 21 }, (_, i) => ({
    ...project,
    project_id: `id-${i}`,
    name: `test-${i}`,
  }));
  vi.mocked(fetchDeletedProjects)
    .mockResolvedValueOnce(rows(many))
    .mockResolvedValueOnce(rows([project], 20));
  render(<DeletedRepositoriesView namespace="alice" backHref="/alice" />);
  expect(await screen.findByText('alice/test-0')).toBeInTheDocument();
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('alice/test')).toBeInTheDocument();
  expect(fetchDeletedProjects).toHaveBeenLastCalledWith(21, 20, 'alice');
  vi.mocked(restoreProject).mockResolvedValue(project);
  vi.mocked(fetchDeletedProjects)
    .mockResolvedValueOnce(rows([], 20))
    .mockResolvedValueOnce(rows(many.slice(0, 20)));
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore repository' }));
  await waitFor(() => expect(screen.getByText('alice/test-0')).toBeInTheDocument());
  expect(screen.queryByText('Page 2')).not.toBeInTheDocument();
  expect(fetchDeletedProjects).toHaveBeenLastCalledWith(21, 0, 'alice');
});
