import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createTestDbMock } = vi.hoisted(() => ({
  createTestDbMock: vi.fn(),
}));

vi.mock('../../../storage/src/__tests__/setup', () => ({
  createTestDB: createTestDbMock,
}));

describe('api test setup helper', () => {
  beforeEach(() => {
    vi.resetModules();
    createTestDbMock.mockReset();
  });

  it('delegates database setup to the storage test helper without module side effects', async () => {
    const expected = {
      db: { kind: 'db' },
      sql: { kind: 'sql' },
      cleanup: vi.fn(),
    };
    createTestDbMock.mockResolvedValue(expected);

    const { setupTestDB } = await import('./setup');

    await expect(setupTestDB()).resolves.toBe(expected);
    expect(createTestDbMock).toHaveBeenCalledTimes(1);
  });
});
