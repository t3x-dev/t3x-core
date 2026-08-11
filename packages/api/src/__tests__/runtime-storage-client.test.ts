import { afterEach, describe, expect, it, vi } from 'vitest';

const clients = vi.hoisted(() => ({
  embedded: { source: 'embedded' },
  external: { source: 'external' },
}));

vi.mock('@t3x-dev/storage', () => ({
  closePostgresStorage: vi.fn(),
  createPostgresStorage: vi.fn(),
  getPostgresClient: () => clients.external,
}));

vi.mock('@t3x-dev/storage/embedded', () => ({
  closeEmbeddedStorage: vi.fn(),
  createEmbeddedStorage: vi.fn(),
  getEmbeddedPostgresClient: () => clients.embedded,
}));

import { getRuntimePostgresClient } from '../lib/db';

describe('runtime storage client selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the embedded entry-point singleton without DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(getRuntimePostgresClient()).toBe(clients.embedded);
  });

  it('uses the root storage singleton for an external PostgreSQL URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/postgres');
    expect(getRuntimePostgresClient()).toBe(clients.external);
  });
});
