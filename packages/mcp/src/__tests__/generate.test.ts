import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: vi.fn(), client: vi.fn(), provider: vi.fn() }));
vi.mock('../db.js', () => ({ getDB: mocks.db }));
vi.mock('../backend.js', () => ({ getApiClient: mocks.client, isApiBackend: () => true }));
vi.mock('@t3x-dev/core', () => ({ generateLeafOutput: mocks.provider }));

import { generateHandler } from '../tools/core/generate';

it.each([
  {},
  { leaf_id: 'legacy' },
])('returns retirement guidance without storage, network or inference', async (args) => {
  const result = await generateHandler(args);
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('LEAF_WRITER_RETIRED');
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
});
