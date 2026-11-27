import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { contextHandler } from '../tools/context.js';

const { getCredentialContext, isApiBackend } = vi.hoisted(() => ({
  getCredentialContext: vi.fn(),
  isApiBackend: vi.fn(),
}));

vi.mock('../backend.js', () => ({ getApiClient: () => ({ getCredentialContext }), isApiBackend }));

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
});

it('reads the current credential context through the shared client', async () => {
  const context = {
    actor_kind: 'agent',
    credential_kind: 'agent',
    project_id: 'project',
    namespace_id: null,
    transition_scopes: ['transition:inspect'],
  };
  getCredentialContext.mockResolvedValue(context);
  const result = await contextHandler({});

  expect(getCredentialContext).toHaveBeenCalledOnce();
  expect(JSON.parse(result.content[0].text)).toEqual(context);
});

it('preserves authentication denial and refuses storage mode', async () => {
  getCredentialContext.mockRejectedValue(new T3xApiError('UNAUTHORIZED', 'Invalid API key', 401));
  const denied = await contextHandler({});
  expect(denied.isError).toBe(true);
  expect(JSON.parse(denied.content[0].text)).toEqual({
    error: { code: 'UNAUTHORIZED', message: 'Invalid API key', status: 401 },
  });

  isApiBackend.mockReturnValue(false);
  const storage = await contextHandler({});
  expect(storage.isError).toBe(true);
  expect(getCredentialContext).toHaveBeenCalledOnce();
});
