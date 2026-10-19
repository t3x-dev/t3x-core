// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeletedRepositoriesView } from '@/components/project/DeletedRepositoriesView';

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

afterEach(() => vi.unstubAllGlobals());

const deleted = {
  project_id: 'deleted-id',
  name: 'deleted-repository',
  namespace: 't3x-dev',
  canonical_path: '/t3x-dev/deleted-repository',
  visibility: 'private',
  created_at: '2026-10-19T02:00:00.000Z',
  deleted_at: '2026-10-19T03:00:00.000Z',
  can_restore: true,
  can_permanently_delete: true,
};
const response = (projects: unknown[], compatible = true) =>
  new Response(
    JSON.stringify({
      success: true,
      data: { projects, limit: 21, offset: 0, ...(compatible ? { status: 'deleted' } : {}) },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

it('rejects an old API active-list response and becomes interactive after retrying a compatible server', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      response(
        [
          {
            project_id: 'active-id',
            name: 'active-repository',
            namespace: 't3x-dev',
            visibility: 'private',
            created_at: '2026-10-19T02:00:00.000Z',
          },
        ],
        false
      )
    )
    .mockResolvedValueOnce(response([deleted]));
  vi.stubGlobal('fetch', fetch);
  render(<DeletedRepositoriesView namespace="t3x-dev" backHref="/t3x-dev" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'incompatible deleted-repository list'
  );
  expect(screen.queryByText('active-repository')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  const requested = new URL(fetch.mock.calls[0][0]);
  expect(requested.pathname).toBe('/api/v1/projects');
  expect(requested.searchParams.get('namespace')).toBe('t3x-dev');
  expect(requested.searchParams.get('status')).toBe('deleted');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore repository' })
  ).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }));
  const confirm = screen.getByRole('button', { name: 'Permanently delete repository' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 't3x-dev/deleted-repository' },
  });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(screen.getByRole('dialog', { name: 'Confirm permanent deletion' })).toHaveTextContent(
    't3x-dev/deleted-repository'
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not mistake an old API empty active list for an empty deleted list', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(response([], false)).mockResolvedValueOnce(response([]))
  );
  render(<DeletedRepositoriesView namespace="t3x-dev" backHref="/t3x-dev" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'incompatible deleted-repository list'
  );
  expect(
    screen.queryByText('No deleted repositories to manage in this namespace.')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(
    await screen.findByText('No deleted repositories to manage in this namespace.')
  ).toBeInTheDocument();
});

it.each([
  { deleted_at: null },
  { deleted_at: 'invalid date' },
  { can_restore: undefined },
  { can_permanently_delete: undefined },
  { namespace: 'another-namespace' },
])('refuses incompatible deleted records: %j', async (invalid) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ ...deleted, ...invalid }])));
  render(<DeletedRepositoriesView namespace="t3x-dev" backHref="/t3x-dev" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'incompatible deleted-repository list'
  );
  expect(screen.queryByText(deleted.name)).not.toBeInTheDocument();
});
