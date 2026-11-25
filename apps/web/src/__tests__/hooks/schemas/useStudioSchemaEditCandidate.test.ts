// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createStudioPreviewCache,
  StudioPreviewCacheContext,
} from '@/hooks/schemas/studioPreviewCache';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';
import { invalidateSessionReads } from '@/infrastructure/session';
import { deferred } from '../deferred';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('@/infrastructure/schemaStudio', () => ({
  readStudioSchemaEditCandidate: mocks.read,
  saveStudioSchemaEditCandidate: mocks.save,
}));

beforeEach(() => {
  mocks.read.mockReset();
  mocks.save.mockReset();
});

const saveInput = {
  workspaceId: 'workspace',
  candidateIds: [],
  ifRevision: 0,
  retryKey: 'attempt-1',
  intent: 'Edit Schema',
  origin: 'studio' as const,
  localContribution: {},
  schemaDefinition: { nodes: { item: { slots: {} } } },
  baseSchemaHash: 'base',
};

it('does not replace a newer refresh with an older response', async () => {
  const old = deferred<unknown>();
  mocks.read.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ revision: 3 });
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await act(async () => result.current.refresh());
  await act(async () => old.resolve({ revision: 2 }));
  expect(result.current.candidate?.revision).toBe(3);
});

it('does not overwrite a saved candidate with a read started before the save', async () => {
  const old = deferred<unknown>();
  mocks.read.mockReturnValueOnce(old.promise);
  const saved = { candidate: { revision: 3 }, workspaceRevision: 8 };
  mocks.save.mockResolvedValueOnce(saved);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await act(async () => result.current.save(saveInput));
  await act(async () => old.resolve({ revision: 2 }));
  expect(result.current.candidate?.revision).toBe(3);
});

it('refreshes a second editor of the same Workspace after a manual save', async () => {
  mocks.read.mockResolvedValue({ candidateId: 'edit', revision: 1 });
  const { result } = renderHook(() => ({
    writer: useStudioSchemaEditCandidate('project', 'workspace', 7),
    reader: useStudioSchemaEditCandidate('project', 'workspace', 7),
  }));
  await waitFor(() => expect(result.current.reader.candidate?.revision).toBe(1));
  const candidate = { candidateId: 'edit', revision: 2 };
  mocks.read.mockResolvedValue(candidate);
  mocks.save.mockResolvedValue({ candidate, workspaceRevision: 8 });
  await act(async () => result.current.writer.save(saveInput));
  expect(result.current.reader.candidate).toEqual(candidate);
});

it('coalesces a double save and prevents another write while it is pending', async () => {
  mocks.read.mockResolvedValue(null);
  const save = deferred<unknown>();
  mocks.save.mockReturnValue(save.promise);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let first!: ReturnType<typeof result.current.save>;
  let second!: ReturnType<typeof result.current.save>;
  act(() => {
    first = result.current.save(saveInput);
    second = result.current.save({ ...saveInput, retryKey: 'double-click' });
  });
  await act(async () => {
    await expect(result.current.save({ ...saveInput, intent: 'different' })).rejects.toThrow(
      /saving/i
    );
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => {
    save.resolve({ candidate: { revision: 3 } });
    await Promise.all([first, second]);
  });
  expect(result.current.pending).toBe(false);
});

it('recovers a saved attempt after its response is lost by replaying the exact request', async () => {
  mocks.read.mockResolvedValue(null);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const saved = {
    outcome: 'reused',
    workspaceRevision: 8,
    candidate: { candidateId: 'edit', revision: 1, retryKey: saveInput.retryKey },
  };
  mocks.read.mockResolvedValue(saved.candidate);
  mocks.save.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(saved);
  await act(async () => {
    expect(await result.current.save(saveInput)).toEqual(saved);
  });
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[0]).toEqual(mocks.save.mock.calls[1]);
  expect(result.current.candidate).toEqual(saved.candidate);
});

it('keeps the original request identity for an unchanged manual retry', async () => {
  mocks.read.mockResolvedValue(null);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.save.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    await expect(result.current.save(saveInput)).rejects.toThrow('Offline');
  });
  mocks.save.mockResolvedValueOnce({
    outcome: 'created',
    workspaceRevision: 8,
    candidate: { candidateId: 'edit', revision: 1 },
  });
  await act(async () => {
    await result.current.save({ ...saveInput, retryKey: 'new-click' });
  });
  expect(mocks.save.mock.calls[1][2]).toEqual(saveInput);
});

it('does not reuse a failed request key after the user changes its content', async () => {
  mocks.read.mockResolvedValue(null);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.save.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    await expect(result.current.save(saveInput)).rejects.toThrow('Offline');
  });
  const changed = { ...saveInput, retryKey: 'changed', schemaDefinition: { nodes: {} } };
  mocks.save.mockResolvedValueOnce({
    outcome: 'created',
    workspaceRevision: 8,
    candidate: { candidateId: 'edit', revision: 1 },
  });
  await act(async () => {
    await result.current.save(changed);
  });
  expect(mocks.save.mock.calls[1][2]).toEqual(changed);
});

it('recovers and replaces the server-managed candidate for the selected Workspace', async () => {
  const recovered = {
    candidateId: 'schema-edit',
    revision: 2,
    localContribution: { nodes: { advantage: { slots: {} } } },
  };
  mocks.read.mockResolvedValue(recovered);
  const { result } = renderHook(() => useStudioSchemaEditCandidate('project', 'workspace', 7));
  await waitFor(() => expect(result.current.candidate).toBe(recovered));

  const saved = {
    outcome: 'updated',
    workspaceRevision: 8,
    candidate: { ...recovered, revision: 3 },
  };
  mocks.save.mockResolvedValue(saved);
  await act(async () =>
    result.current.save({
      workspaceId: 'workspace',
      candidateIds: ['base'],
      ifRevision: 2,
      retryKey: 'retry-1',
      intent: 'Add an advantage node',
      origin: 'studio',
      localContribution: recovered.localContribution,
    })
  );
  await waitFor(() => expect(result.current.candidate).toEqual(saved.candidate));
  expect(mocks.save).toHaveBeenCalledWith('project', 'workspace', expect.any(Object));
});

it('synchronizes generated snapshots only for the matching Workspace and removes listeners', async () => {
  const original = { candidateId: 'schema-edit', revision: 2 };
  const generated = { ...original, revision: 3 };
  mocks.read.mockResolvedValue(original);
  const { result, unmount } = renderHook(() =>
    useStudioSchemaEditCandidate('project', 'workspace', 7)
  );
  await waitFor(() => expect(result.current.candidate).toBe(original));
  const calls = mocks.read.mock.calls.length;
  act(() => {
    window.dispatchEvent(
      new CustomEvent('t3x-schema-candidate-updated', {
        detail: { projectId: 'project', workspaceId: 'another-workspace' },
      })
    );
  });
  expect(mocks.read).toHaveBeenCalledTimes(calls);
  mocks.read.mockResolvedValue(generated);
  act(() => {
    window.dispatchEvent(
      new CustomEvent('t3x-schema-candidate-updated', {
        detail: { projectId: 'project', workspaceId: 'workspace' },
      })
    );
  });
  await waitFor(() => expect(result.current.candidate).toBe(generated));
  const next = { ...generated, revision: 4 };
  mocks.read.mockResolvedValue(next);
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 't3x-schema-candidate-updated',
        newValue: JSON.stringify({ projectId: 'project', workspaceId: 'workspace' }),
      })
    );
  });
  await waitFor(() => expect(result.current.candidate).toBe(next));
  unmount();
  const after = mocks.read.mock.calls.length;
  window.dispatchEvent(new Event('focus'));
  expect(mocks.read).toHaveBeenCalledTimes(after);
});

it('rejects queued writes and late replies after the browser account changes', async () => {
  localStorage.removeItem('t3x-user');
  mocks.read.mockResolvedValue(null);
  const pending = deferred<unknown>();
  mocks.save.mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(() =>
    useStudioSchemaEditCandidate('project', 'workspace', 7)
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  let request!: ReturnType<typeof result.current.save>;
  act(() => {
    request = result.current.save(saveInput);
  });
  const failed = expect(request).rejects.toThrow(/context changed/);
  act(() => {
    localStorage.setItem('t3x-user', JSON.stringify({ id: 'another-account' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 't3x-user' }));
  });
  await act(async () => pending.resolve({ candidate: { revision: 1 }, workspaceRevision: 8 }));
  await failed;
  expect(result.current.candidate).toBeNull();
  expect(result.current.error).toMatch(/Account changed/);
  await expect(result.current.save(saveInput)).rejects.toThrow(/context changed/);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  unmount();
  localStorage.removeItem('t3x-user');
});

it('skips a confirmed empty revision and reads a newly reported candidate', async () => {
  const { result, rerender } = renderHook(
    ({ absent }) => useStudioSchemaEditCandidate('project', 'workspace', 7, absent),
    { initialProps: { absent: true } }
  );
  expect(result.current.loading).toBe(false);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue({ candidateId: 'edit', revision: 1 });
  rerender({ absent: false });
  await waitFor(() => expect(result.current.candidate?.candidateId).toBe('edit'));
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith('project', 'workspace');
});

it('shows the exact saved draft immediately on revisit while revalidating, without reusing it on another branch or revision', async () => {
  const cache = createStudioPreviewCache();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StudioPreviewCacheContext.Provider, { value: cache }, children);
  const candidate = {
    candidateId: 'edit',
    revision: 2,
    draftPreview: {
      candidateIds: [],
      saved: {
        workspace: { id: 'workspace', revision: 7 },
        freshness: { candidateId: 'edit', candidateRevision: 2 },
      },
    },
  };
  mocks.read.mockResolvedValueOnce(candidate);
  const first = renderHook(
    () => useStudioSchemaEditCandidate('project', 'workspace', 7, false, 'main'),
    { wrapper }
  );
  await waitFor(() => expect(first.result.current.candidate).toEqual(candidate));
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith('project', 'workspace', 7);
  first.unmount();

  const background = deferred<null>();
  mocks.read.mockReturnValue(background.promise);
  const again = renderHook(
    ({ revision, branch }) =>
      useStudioSchemaEditCandidate('project', 'workspace', revision, false, branch),
    { wrapper, initialProps: { revision: 7, branch: 'main' } }
  );
  expect(again.result.current.candidate).toEqual(candidate);
  expect(again.result.current.loading).toBe(false);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  act(() => invalidateSessionReads());
  expect(again.result.current.candidate).toBeNull();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  await act(async () => background.resolve(null));
  expect(again.result.current.error).toMatch(/access changed/i);
  again.rerender({ revision: 7, branch: 'feature' });
  expect(again.result.current.candidate).toBeNull();
  again.rerender({ revision: 8, branch: 'main' });
  expect(again.result.current.candidate).toBeNull();
});
