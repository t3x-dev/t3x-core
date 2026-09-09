import { afterEach, describe, expect, it, vi } from 'vitest';

const clients = vi.hoisted(() => ({
  embedded: { source: 'embedded' },
  external: { source: 'external' },
}));
const storageMocks = vi.hoisted(() => ({
  closePostgresStorage: vi.fn(),
  createPostgresBootstrapStorage: vi.fn(),
  createPostgresRuntimeStorage: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  closePostgresStorage: storageMocks.closePostgresStorage,
  createPostgresBootstrapStorage: storageMocks.createPostgresBootstrapStorage,
  createPostgresRuntimeStorage: storageMocks.createPostgresRuntimeStorage,
  getPostgresClient: () => clients.external,
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

  it('uses read-only schema validation by default for an external PostgreSQL URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime@localhost:5432/t3x');
    vi.stubEnv('T3X_POSTGRES_STARTUP_MODE', '');
    storageMocks.createPostgresRuntimeStorage.mockResolvedValue(clients.external);

    await expect(getDB()).resolves.toBe(clients.external);

    expect(storageMocks.createPostgresRuntimeStorage).toHaveBeenCalledOnce();
    expect(storageMocks.createPostgresBootstrapStorage).not.toHaveBeenCalled();
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
