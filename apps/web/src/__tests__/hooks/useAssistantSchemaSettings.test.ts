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
  generationMode: 'schema_yops_v1',
  status: 'pending',
  settings: { action: 'remove_slot', nodePath: 'product', name: 'owner', definition: {} },
};
beforeEach(() => {
  vi.resetAllMocks();
});

it('Confirm generates a Schema candidate but does not apply it to Draft', async () => {
  mocks.read.mockResolvedValue(record);
  mocks.confirm.mockResolvedValue({ ...record, status: 'generated' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(record));
  await act(() => result.current.generate(record.settings as never));
  expect(mocks.confirm).toHaveBeenCalledWith('p', 'w', record, record.settings, {
    generateSnapshot: true,
    applyToDraft: false,
    discardStudioCandidate: false,
  });
});

it('applies an already generated candidate only after the separate Save Schema to Draft action', async () => {
  const generated = { ...record, status: 'generated' };
  mocks.read.mockResolvedValue(generated);
  mocks.confirm.mockResolvedValue({ ...record, status: 'applied' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(generated));
  await act(() => result.current.generate(record.settings as never));
  expect(mocks.confirm.mock.calls[0][4]).toMatchObject({ applyToDraft: true });
});

it('restores legacy pending cards without making their save endpoint incompatible', async () => {
  const legacy = {
    ...record,
    generationMode: undefined,
    settings: { ...record.settings, action: 'add_slot' },
  };
  mocks.read.mockResolvedValue(legacy);
  mocks.confirm.mockResolvedValue({ ...legacy, status: 'applied' });
  const { result } = renderHook(() => useAssistantSchemaSettings('p', 'w', 'c', 'key'));
  await waitFor(() => expect(result.current.record).toEqual(legacy));
  await act(() => result.current.generate(legacy.settings as never));
  expect(mocks.confirm.mock.calls[0][4]).toMatchObject({ applyToDraft: true });
});
