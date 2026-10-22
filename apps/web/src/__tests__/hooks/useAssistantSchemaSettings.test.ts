// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAssistantSchemaSettings } from '@/hooks/schemas/useAssistantSchemaSettings';

const mocks = vi.hoisted(() => ({ read: vi.fn(), confirm: vi.fn() }));
vi.mock('@/infrastructure/workspaceAssistant', () => ({
  readAssistantSchemaSettings: mocks.read,
  confirmAssistantSchemaSettings: mocks.confirm,
}));
const record = {
  settingsId: 'card',
  revision: 1,
  status: 'pending',
  settings: { action: 'remove_slot', nodePath: 'product', name: 'owner', definition: {} },
};
beforeEach(() => {
  vi.resetAllMocks();
});

it.each([
  'add_node',
  'add_slot',
  'edit_slot',
  'remove_slot',
])('Confirm for %s generates, validates and applies Schema to Draft in one request', async (action) => {
  const pending = { ...record, settings: { ...record.settings, action } };
  mocks.read.mockResolvedValue(pending);
  mocks.confirm.mockResolvedValue({ ...pending, status: 'applied' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(pending));
  await act(() => result.current.generate(pending.settings as never));
  expect(mocks.confirm).toHaveBeenCalledWith('p', 'w', pending, pending.settings, {
    generateSnapshot: true,
    applyToDraft: true,
    discardStudioCandidate: false,
  });
});

it('can finish applying an already generated candidate after an interrupted request', async () => {
  const generated = { ...record, status: 'generated' };
  mocks.read.mockResolvedValue(generated);
  mocks.confirm.mockResolvedValue({ ...record, status: 'applied' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(generated));
  await act(() => result.current.generate(record.settings as never));
  expect(mocks.confirm.mock.calls[0][4]).toMatchObject({ applyToDraft: true });
});

it('resumes a confirmed card through generation and Draft application', async () => {
  const confirmed = { ...record, status: 'confirmed' };
  mocks.read.mockResolvedValue(confirmed);
  mocks.confirm.mockResolvedValue({ ...confirmed, status: 'applied' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(confirmed));
  await act(() => result.current.generate(confirmed.settings as never));
  expect(mocks.confirm.mock.calls[0][4]).toMatchObject({
    generateSnapshot: true,
    applyToDraft: true,
  });
});

it('keeps an in-flight Confirm across workspace refreshes and accepts its completion', async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockResolvedValue(record);
  mocks.confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(
    ({ refresh }) => useAssistantSchemaSettings('p', 'w', 'c', refresh),
    { initialProps: { refresh: 'r0' } }
  );
  await waitFor(() => expect(result.current.record).toEqual(record));
  let request!: Promise<unknown>;
  act(() => {
    request = result.current.generate(record.settings as never);
  });
  expect(result.current.generating).toBe(true);
  mocks.read.mockResolvedValue({ ...record, revision: 2, status: 'confirmed' });
  rerender({ refresh: 'r1' });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  expect(result.current.record).not.toBeNull();
  expect(result.current.generating).toBe(true);
  const applied = { ...record, revision: 3, status: 'applied' };
  await act(async () => {
    finish(applied);
    await request;
  });
  expect(result.current.record).toEqual(applied);
  expect(result.current.generating).toBe(false);
});

it('does not apply an old workspace completion to a newly selected workspace', async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockResolvedValue(record);
  mocks.confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(
    ({ workspace }) => useAssistantSchemaSettings('p', workspace, 'c', 'r0'),
    { initialProps: { workspace: 'w' } }
  );
  await waitFor(() => expect(result.current.record).toEqual(record));
  let request!: Promise<unknown>;
  act(() => {
    request = result.current.generate(record.settings as never);
  });
  const other = { ...record, settingsId: 'other' };
  mocks.read.mockResolvedValue(other);
  rerender({ workspace: 'other' });
  await waitFor(() => expect(result.current.record).toEqual(other));
  await act(async () => {
    finish({ ...record, status: 'applied' });
    await request;
  });
  expect(result.current.record).toEqual(other);
  expect(result.current.generating).toBe(false);
});

it('coalesces repeated Confirm clicks while generation is still in flight', async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockResolvedValue(record);
  mocks.confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'r0'));
  await waitFor(() => expect(result.current.record).toEqual(record));
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.generate(record.settings as never);
    second = result.current.generate(record.settings as never);
  });
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ ...record, status: 'applied' });
    await Promise.all([first, second]);
  });
});

it('does not let a late background read replace the completed Confirm result', async () => {
  let finishRead!: (value: unknown) => void;
  mocks.read.mockResolvedValueOnce(record).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      })
  );
  const applied = { ...record, revision: 3, status: 'applied' };
  mocks.confirm.mockResolvedValue(applied);
  const { result, rerender } = renderHook(
    ({ refresh }) => useAssistantSchemaSettings('p', 'w', 'c', refresh),
    { initialProps: { refresh: 'r0' } }
  );
  await waitFor(() => expect(result.current.record).toEqual(record));
  rerender({ refresh: 'r1' });
  await act(() => result.current.generate(record.settings as never));
  await act(async () => {
    finishRead({ ...record, status: 'confirmed' });
  });
  expect(result.current.record).toEqual(applied);
});

it('clears a previous operation error only when a different confirmation card is restored', async () => {
  mocks.read.mockResolvedValue(record);
  mocks.confirm.mockRejectedValue(new Error('Old migration blocker'));
  const { result, rerender } = renderHook(
    ({ refresh }) => useAssistantSchemaSettings('p', 'w', 'c', refresh),
    { initialProps: { refresh: 'r0' } }
  );
  await waitFor(() => expect(result.current.record).toEqual(record));
  await act(async () => {
    await expect(result.current.generate(record.settings as never)).rejects.toThrow(
      'Old migration blocker'
    );
  });
  expect(result.current.error).toBe('Old migration blocker');
  rerender({ refresh: 'r1' });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  expect(result.current.error).toBe('Old migration blocker');
  mocks.read.mockResolvedValue({ ...record, settingsId: 'new-operation' });
  rerender({ refresh: 'r2' });
  await waitFor(() => expect(result.current.record?.settingsId).toBe('new-operation'));
  expect(result.current.error).toBeUndefined();
});
