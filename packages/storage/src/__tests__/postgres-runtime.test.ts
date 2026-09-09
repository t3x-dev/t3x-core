import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { drizzleMock, postgresMock, seedBuiltinTemplatesMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(),
  postgresMock: vi.fn(),
  seedBuiltinTemplatesMock: vi.fn(),
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

vi.mock('postgres', () => ({
  default: postgresMock,
}));

vi.mock('../seed/templates', () => ({
  seedBuiltinTemplates: seedBuiltinTemplatesMock,
}));

import {
  closePostgresStorage,
  createPostgresRuntimeStorage,
  inspectPostgresSchema,
  migratePostgresStorage,
  POSTGRES_SCHEMA_VERSION,
  PostgresSchemaVersionError,
} from '../adapters/postgres';

function makeClient(
  options: { tableExists?: boolean; version?: number | null; versionError?: Error } = {}
) {
  const { tableExists = true, version = POSTGRES_SCHEMA_VERSION, versionError } = options;
  const client = {
    begin: vi.fn(async (callback: (transaction: typeof client) => Promise<void>) =>
      callback(client)
    ),
    end: vi.fn().mockResolvedValue(undefined),
    unsafe: vi.fn(async (query: string) => {
      if (query.includes("to_regclass('public._schema_version')")) {
        return [{ tableName: tableExists ? '_schema_version' : null }];
      }
      if (query.includes('FROM public._schema_version')) {
        if (versionError) throw versionError;
        return version === null ? [] : [{ version }];
      }
      if (query.includes('SELECT version FROM _schema_version')) return [];
      return [];
    }),
  };
  return client;
}

describe('PostgreSQL runtime and migration entry points', () => {
  beforeEach(() => {
    postgresMock.mockReset();
    drizzleMock.mockReset();
    seedBuiltinTemplatesMock.mockReset();
    drizzleMock.mockReturnValue({ kind: 'drizzle-db' });
  });

  afterEach(async () => {
    await closePostgresStorage();
  });

  it('opens a current runtime schema using SELECT-only validation and no seed', async () => {
    const client = makeClient();
    postgresMock.mockReturnValue(client);

    await expect(
      createPostgresRuntimeStorage({ connectionString: 'postgresql://runtime/db' })
    ).resolves.toEqual({ kind: 'drizzle-db' });

    expect(client.begin).not.toHaveBeenCalled();
    expect(seedBuiltinTemplatesMock).not.toHaveBeenCalled();
    expect(client.unsafe).toHaveBeenCalledTimes(2);
    for (const [query] of client.unsafe.mock.calls) {
      expect(query.trimStart().startsWith('SELECT')).toBe(true);
    }
  });

  it('fails an uninitialized runtime without creating or seeding anything', async () => {
    const client = makeClient({ tableExists: false });
    postgresMock.mockReturnValue(client);

    const opening = createPostgresRuntimeStorage({
      connectionString: 'postgresql://runtime/uninitialized',
    });

    await expect(opening).rejects.toMatchObject({
      name: 'PostgresSchemaVersionError',
      reason: 'missing',
      metadata: {
        currentVersion: null,
        expectedVersion: POSTGRES_SCHEMA_VERSION,
      },
    });
    await expect(opening).rejects.toThrow(/migratePostgresStorage.*no DDL or seed repair/i);
    expect(client.begin).not.toHaveBeenCalled();
    expect(seedBuiltinTemplatesMock).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it.each([
    ['outdated', POSTGRES_SCHEMA_VERSION - 1, /migratePostgresStorage/i],
    ['newer', POSTGRES_SCHEMA_VERSION + 1, /Upgrade the T3X runtime/i],
  ] as const)('rejects a %s schema without changing its version', async (reason, version, message) => {
    const client = makeClient({ version });
    postgresMock.mockReturnValue(client);

    const opening = createPostgresRuntimeStorage({ connectionString: 'postgresql://runtime/db' });

    await expect(opening).rejects.toMatchObject({ reason });
    await expect(opening).rejects.toThrow(message);
    expect(client.begin).not.toHaveBeenCalled();
    expect(seedBuiltinTemplatesMock).not.toHaveBeenCalled();
  });

  it('reports the runtime grant needed when schema metadata is unreadable', async () => {
    const client = makeClient({ versionError: new Error('permission denied') });
    postgresMock.mockReturnValue(client);

    const opening = createPostgresRuntimeStorage({ connectionString: 'postgresql://runtime/db' });

    await expect(opening).rejects.toBeInstanceOf(PostgresSchemaVersionError);
    await expect(opening).rejects.toMatchObject({ reason: 'unreadable' });
    await expect(opening).rejects.toThrow(/USAGE.*SELECT.*migration-owner/i);
  });

  it('runs DDL and seed only in the standalone migration job and closes its client', async () => {
    const client = makeClient();
    postgresMock.mockReturnValue(client);

    await expect(
      migratePostgresStorage({ connectionString: 'postgresql://migration-owner/db' })
    ).resolves.toMatchObject({
      currentVersion: POSTGRES_SCHEMA_VERSION,
      expectedVersion: POSTGRES_SCHEMA_VERSION,
      status: 'current',
    });

    expect(client.begin).toHaveBeenCalledOnce();
    expect(client.unsafe.mock.calls.some(([query]) => query.includes('CREATE TABLE'))).toBe(true);
    expect(seedBuiltinTemplatesMock).toHaveBeenCalledOnce();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('exposes schema metadata through a transient read-only inspection', async () => {
    const client = makeClient({ version: POSTGRES_SCHEMA_VERSION - 1 });
    postgresMock.mockReturnValue(client);

    await expect(
      inspectPostgresSchema({ connectionString: 'postgresql://orchestrator/db' })
    ).resolves.toEqual({
      table: 'public._schema_version',
      currentVersion: POSTGRES_SCHEMA_VERSION - 1,
      expectedVersion: POSTGRES_SCHEMA_VERSION,
      status: 'outdated',
    });
    expect(client.begin).not.toHaveBeenCalled();
    expect(seedBuiltinTemplatesMock).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });
});
