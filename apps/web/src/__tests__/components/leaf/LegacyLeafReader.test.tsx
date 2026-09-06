// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LegacyLeafReader } from '@/components/leaf/LegacyLeafReader';

const mock = vi.hoisted(() => ({ hook: vi.fn(), download: vi.fn() }));
vi.mock('@/hooks/leaves/useLegacyLeaf', () => ({ useLegacyLeaf: mock.hook }));
const leaf = {
  id: 'leaf',
  project_id: 'p',
  title: 'Saved brief',
  commit_hash: 'sha256:old',
  output: '<script>unsafe()</script>',
  constraints: [],
  assertions: [],
  runner_assertions: [],
};
const history = {
  id: 'history',
  leaf_id: 'leaf',
  output: 'Earlier output',
  model: 'recorded-model',
  generated_at: '2026-01-01',
  config: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.hook.mockReturnValue({
    leaf,
    history: [history],
    page: 0,
    setPage: vi.fn(),
    download: mock.download,
  });
});
it('reads and exports the selected historical record without mutation controls', () => {
  const { container } = render(<LegacyLeafReader projectId="p" leafId="leaf" />);
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'View source State' })).toHaveAttribute(
    'href',
    '/project/p?view=overview&commit=sha256%3Aold'
  );
  expect(screen.queryByRole('button', { name: /generate|delete|learn|restore/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /2026-01-01/ }));
  expect(screen.getByText('Earlier output')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Export record' }));
  expect(mock.download).toHaveBeenCalledWith('json', history);
  fireEvent.click(screen.getByRole('button', { name: 'Current saved output' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export record' }));
  expect(mock.download).toHaveBeenLastCalledWith('json', leaf);
});
it('keeps current output available while reporting unavailable history', () => {
  mock.hook.mockReturnValue({ leaf, historyError: 'denied', page: 0, retry: vi.fn() });
  render(<LegacyLeafReader projectId="p" leafId="leaf" />);
  expect(screen.getByRole('alert')).toHaveTextContent('History unavailable');
  expect(screen.getByText(leaf.output)).toBeVisible();
});
