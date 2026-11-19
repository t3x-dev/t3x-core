import { afterEach, describe, expect, it, vi } from 'vitest';

const clients = vi.hoisted(() => ({
  embedded: { source: 'embedded' },
  external: { source: 'external' },
}));
const storageMocks = vi.hoisted(() => ({
  closePostgresStorage: vi.fn().mockResolvedValue(undefined),
  createPostgresBootstrapStorage: vi.fn(),
  createPostgresRuntimeStorage: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  closePostgresStorage: storageMocks.closePostgresStorage,
  createPostgresBootstrapStorage: storageMocks.createPostgresBootstrapStorage,
  createPostgresRuntimeStorage: storageMocks.createPostgresRuntimeStorage,
  getPostgresClient: () => clients.external,
}));

const initializeRegistry = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock('../lib/yschema-artifact-registry', () => ({
  ensureBuiltInYSchemaArtifacts: initializeRegistry,
}));

vi.mock('@t3x-dev/storage/embedded', () => ({
  closeEmbeddedStorage: vi.fn(),
  createEmbeddedStorage: vi.fn(),
  getEmbeddedPostgresClient: () => clients.embedded,
}));

import { closeDB, getDB, getRuntimePostgresClient } from '../lib/db';

describe('runtime storage client selection', () => {
  afterEach(async () => {
    await closeDB();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses the embedded entry-point singleton without DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(getRuntimePostgresClient()).toBe(clients.embedded);
  });

  it('uses the root storage singleton for an external PostgreSQL URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/postgres');
    expect(getRuntimePostgresClient()).toBe(clients.external);
  });

  it('uses read-only migration validation by default for an external PostgreSQL URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime@localhost:5432/t3x');
    vi.stubEnv('T3X_POSTGRES_STARTUP_MODE', '');
    storageMocks.createPostgresRuntimeStorage.mockResolvedValue(clients.external);

    await expect(getDB()).resolves.toBe(clients.external);

    expect(storageMocks.createPostgresRuntimeStorage).toHaveBeenCalledOnce();
    expect(storageMocks.createPostgresBootstrapStorage).not.toHaveBeenCalled();
  });

  it('waits for one registry initialization before returning storage to concurrent callers', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime@localhost:5432/t3x');
    vi.stubEnv('T3X_POSTGRES_STARTUP_MODE', 'runtime');
    storageMocks.createPostgresRuntimeStorage.mockResolvedValue(clients.external);
    let finishSeed!: (count: number) => void;
    const seed = new Promise<number>((resolve) => {
      finishSeed = resolve;
    });
    initializeRegistry.mockReturnValueOnce(seed);
    const resolved = vi.fn();
    const first = getDB().then(resolved);
    const second = getDB().then(resolved);

    await Promise.resolve();
    expect(initializeRegistry).toHaveBeenCalledExactlyOnceWith(clients.external);
    expect(resolved).not.toHaveBeenCalled();

    finishSeed(1);
    await Promise.all([first, second]);
    await expect(getDB()).resolves.toBe(clients.external);
    expect(initializeRegistry).toHaveBeenCalledOnce();
    expect(resolved).toHaveBeenCalledTimes(2);
  });

  it('closes a failed initialization and can retry it', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime@localhost:5432/t3x');
    vi.stubEnv('T3X_POSTGRES_STARTUP_MODE', 'runtime');
    storageMocks.createPostgresRuntimeStorage.mockResolvedValue(clients.external);
    initializeRegistry.mockRejectedValueOnce(new Error('registry unavailable'));

    await expect(getDB()).rejects.toThrow('registry unavailable');
    expect(storageMocks.closePostgresStorage).toHaveBeenCalledOnce();
    await expect(getDB()).resolves.toBe(clients.external);
    expect(initializeRegistry).toHaveBeenCalledTimes(2);
  });

  it('keeps external bootstrap available only when explicitly selected', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://migration-owner@localhost:5432/t3x');
    vi.stubEnv('T3X_POSTGRES_STARTUP_MODE', 'bootstrap');
    storageMocks.createPostgresBootstrapStorage.mockResolvedValue(clients.external);

    await expect(getDB()).resolves.toBe(clients.external);

    expect(storageMocks.createPostgresBootstrapStorage).toHaveBeenCalledOnce();
    expect(storageMocks.createPostgresRuntimeStorage).not.toHaveBeenCalled();
  });
});
