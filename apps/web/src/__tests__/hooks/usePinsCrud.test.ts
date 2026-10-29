// @vitest-environment jsdom
import type { Pin } from '@t3x-dev/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPin, deletePin } from '@/commands/pins';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { fetchPins } from '@/queries/pins';
import { usePinsStore } from '@/store/pinsStore';
import { deferred } from './deferred';

vi.mock('@/queries/pins', () => ({ fetchPins: vi.fn() }));
vi.mock('@/commands/pins', () => ({
  createPin: vi.fn(),
  deletePin: vi.fn(),
  updatePinAssertions: vi.fn(),
}));
const pin = (project: string): Pin => ({
  id: `pin-${project}`,
  project_id: project,
  type: 'import',
  ref_id: `material-${project}`,
  pinned_at: '2026-10-28T00:00:00Z',
});
beforeEach(() => {
  vi.resetAllMocks();
  usePinsStore.setState(usePinsStore.getInitialState(), true);
});
afterEach(cleanup);

it('owns pending reads by project, including leaving and returning to the same project', async () => {
  const old = deferred<Pin[]>();
  const b = deferred<Pin[]>();
  vi.mocked(fetchPins)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(b.promise)
    .mockResolvedValueOnce([pin('a')]);
  const { result } = renderHook(usePinsCrud);
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.fetch('a');
    second = result.current.fetch('b');
  });
  expect(usePinsStore.getState().currentProjectId).toBe('b');
  expect(usePinsStore.getState().pins).toEqual([]);
  await act(async () => result.current.fetch('a'));
  await act(async () => {
    old.resolve([pin('obsolete')]);
    b.resolve([pin('b')]);
    await Promise.all([first, second]);
  });
  expect(usePinsStore.getState().currentProjectId).toBe('a');
  expect(usePinsStore.getState().pins).toEqual([pin('a')]);
});

it('makes duplicate readers await the shared request and allows retry after failure', async () => {
  const pending = deferred<Pin[]>();
  vi.mocked(fetchPins)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce([pin('a')]);
  const { result } = renderHook(usePinsCrud);
  let first!: Promise<void>;
  let secondDone = false;
  let second!: Promise<void>;
  act(() => {
    first = result.current.fetch('a');
    second = result.current.fetch('a').then(() => {
      secondDone = true;
    });
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(secondDone).toBe(false);
  await act(async () => {
    pending.reject(new Error('offline'));
    await Promise.all([first, second]);
  });
  expect(usePinsStore.getState().initialized).toBe(false);
  await act(async () => result.current.fetch('a'));
  expect(usePinsStore.getState().pins).toEqual([pin('a')]);
});

it('does not add an old project’s mutation result to the selected project', async () => {
  vi.mocked(fetchPins).mockImplementation(async (id) => [pin(id)]);
  const created = deferred<Pin>();
  vi.mocked(createPin).mockReturnValue(created.promise);
  const { result } = renderHook(usePinsCrud);
  await act(async () => result.current.fetch('a'));
  let mutation!: Promise<Pin | null>;
  act(() => {
    mutation = result.current.add('a', 'import', 'new-material');
  });
  await act(async () => result.current.fetch('b'));
  await act(async () => {
    created.resolve({ ...pin('a'), id: 'new-pin' });
    await mutation;
  });
  expect(usePinsStore.getState().pins).toEqual([pin('b')]);
});

it('does not roll back an old project’s failed delete into the selected project', async () => {
  vi.mocked(fetchPins).mockImplementation(async (id) => [pin(id)]);
  const deleted = deferred<void>();
  vi.mocked(deletePin).mockReturnValue(deleted.promise);
  const { result } = renderHook(usePinsCrud);
  await act(async () => result.current.fetch('a'));
  let mutation!: Promise<void>;
  act(() => {
    mutation = result.current.remove(pin('a').id);
  });
  await act(async () => result.current.fetch('b'));
  await act(async () => {
    deleted.reject(new Error('offline'));
    await mutation;
  });
  expect(usePinsStore.getState().pins).toEqual([pin('b')]);
});
