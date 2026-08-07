import { afterAll, describe, expect, it } from 'vitest';
import { closePostgresStorage, createPostgresStorage } from '../adapters/postgres';
import { createTestDB } from './setup';

let cleanup: (() => Promise<void>) | undefined;

afterAll(async () => {
  await cleanup?.();
});

describe('PostgreSQL schema migrations', () => {
  it('upgrades a v60 database with the complete v61 Transition storage', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe('DROP TABLE transition_verification_receipts');
    await setup.sql.unsafe('DROP TABLE transition_proposal_preparations');
    await setup.sql.unsafe('UPDATE _schema_version SET version = 60 WHERE singleton = TRUE');

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [tables] = await setup.sql.unsafe<
      Array<{ preparations: string | null; verification_receipts: string | null }>
    >(`
      SELECT
        to_regclass('public.transition_proposal_preparations')::text AS preparations,
        to_regclass('public.transition_verification_receipts')::text AS verification_receipts
    `);

    expect(version?.version).toBe(61);
    expect(tables).toEqual({
      preparations: 'transition_proposal_preparations',
      verification_receipts: 'transition_verification_receipts',
    });
  });
});
