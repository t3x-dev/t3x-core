// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('@/infrastructure/schemaStudio', () => ({
  readStudioSchemaEditCandidate: mocks.read,
  saveStudioSchemaEditCandidate: mocks.save,
}));

beforeEach(() => {
  mocks.read.mockReset();
  mocks.save.mockReset();
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
