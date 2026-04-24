import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postgresMock, createPostgresStorageMock, closePostgresStorageMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(),
  createPostgresStorageMock: vi.fn(),
  closePostgresStorageMock: vi.fn(),
}));

vi.mock('postgres', () => ({
  default: postgresMock,
}));

vi.mock('../adapters/postgres', () => ({
  createPostgresStorage: createPostgresStorageMock,
  closePostgresStorage: closePostgresStorageMock,
}));

import { createTestDB } from './setup';

function makeSqlClient() {
  return {
    unsafe: vi.fn().mockResolvedValue([]),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

describe('storage test setup helper', () => {
  beforeEach(() => {
    postgresMock.mockReset();
    createPostgresStorageMock.mockReset();
    closePostgresStorageMock.mockReset();
  });

  it('initializes through the storage adapter without an extra schema bootstrap client', async () => {
    const adminSql = makeSqlClient();
    const rawSql = makeSqlClient();
    const dropSql = makeSqlClient();
    const db = { kind: 'db' };

    postgresMock
      .mockReturnValueOnce(adminSql)
      .mockReturnValueOnce(rawSql)
      .mockReturnValueOnce(dropSql);
    createPostgresStorageMock.mockResolvedValue(db);

    const env = await createTestDB();

    expect(postgresMock).toHaveBeenCalledTimes(2);
    expect(postgresMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/postgres'),
      expect.objectContaining({ max: 1, onnotice: expect.any(Function) })
    );
    expect(postgresMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/test_'),
      expect.objectContaining({ max: 5, onnotice: expect.any(Function) })
    );
    expect(createPostgresStorageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining('/test_'),
        onnotice: expect.any(Function),
      })
    );
    expect(adminSql.unsafe).toHaveBeenCalledWith(expect.stringContaining('CREATE DATABASE'));
    expect(rawSql.unsafe).not.toHaveBeenCalled();
    expect(env.db).toBe(db);

    await env.cleanup();

    expect(closePostgresStorageMock).toHaveBeenCalledOnce();
    expect(postgresMock).toHaveBeenCalledTimes(3);
    expect(dropSql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('SELECT pg_terminate_backend(pid)')
    );
    expect(dropSql.unsafe).toHaveBeenCalledWith(expect.stringContaining('DROP DATABASE IF EXISTS'));
  });
});
