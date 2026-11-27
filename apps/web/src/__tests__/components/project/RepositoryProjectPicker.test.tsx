// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RepositoryProjectPicker } from '@/components/project/RepositoryProjectPicker';

const listProjectPage = vi.hoisted(() => vi.fn());
vi.mock(import('@/infrastructure/projects'), async (importOriginal) => ({
  ...(await importOriginal()),
  listProjectPage,
}));

it('searches before paginating and keeps the selected project outside the current results', async () => {
  const picked = { project_id: 'picked', name: 'Picked' };
  listProjectPage
    .mockResolvedValueOnce({ items: [picked], next_cursor: 'first', has_more: true })
    .mockResolvedValueOnce({
      items: [{ project_id: 'older', name: 'Search match' }],
      next_cursor: 'match',
      has_more: true,
    })
    .mockResolvedValueOnce({
      items: [{ project_id: 'other', name: 'Another match' }],
      next_cursor: null,
      has_more: false,
    });
  const pick = vi.fn();
  const view = render(
    <RepositoryProjectPicker id="project" label="Project" value="" onChange={pick} />
  );
  await screen.findByRole('option', { name: 'Picked' });
  expect(listProjectPage).toHaveBeenCalledExactlyOnceWith(
    20,
    '',
    undefined,
    undefined,
    expect.any(AbortSignal)
  );
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'picked' } });
  expect(pick).toHaveBeenCalledWith('picked', 'Picked');
  view.rerender(
    <RepositoryProjectPicker id="project" label="Project" value="picked" onChange={pick} />
  );

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search repositories' }), {
    target: { value: ' Search ' },
  });
  await screen.findByRole('option', { name: 'Search match' });
  expect(listProjectPage).toHaveBeenLastCalledWith(
    20,
    '',
    undefined,
    expect.objectContaining({ q: 'Search' }),
    expect.any(AbortSignal)
  );
  expect(screen.getByLabelText('Project')).toHaveValue('picked');
  fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
  await screen.findByRole('option', { name: 'Another match' });
  expect(listProjectPage).toHaveBeenLastCalledWith(
    20,
    'match',
    undefined,
    expect.objectContaining({ q: 'Search' }),
    expect.any(AbortSignal)
  );
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Load more projects' })).not.toBeInTheDocument()
  );
});

it('discards late results from a superseded search', async () => {
  let finishOld!: (page: {
    items: { project_id: string; name: string }[];
    next_cursor: string;
  }) => void;
  let oldSignal: AbortSignal | undefined;
  listProjectPage.mockReset().mockImplementation((_limit, _cursor, _namespace, filter, signal) => {
    if (filter?.q === 'older') {
      oldSignal = signal;
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    }
    return Promise.resolve({
      items: filter?.q ? [{ project_id: 'latest', name: 'Latest' }] : [],
      next_cursor: null,
    });
  });
  render(<RepositoryProjectPicker id="project" label="Project" value="" onChange={vi.fn()} />);
  const search = screen.getByRole('searchbox', { name: 'Search repositories' });
  fireEvent.change(search, { target: { value: 'older' } });
  await waitFor(() => expect(finishOld).toBeTypeOf('function'));
  fireEvent.change(search, { target: { value: 'latest' } });
  await screen.findByRole('option', { name: 'Latest' });
  expect(oldSignal?.aborted).toBe(true);

  await act(async () =>
    finishOld({ items: [{ project_id: 'old', name: 'Stale' }], next_cursor: 'old' })
  );
  expect(screen.getByRole('option', { name: 'Latest' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Stale' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Load more projects' })).not.toBeInTheDocument();
});
