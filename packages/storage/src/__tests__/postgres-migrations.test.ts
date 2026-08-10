import { afterEach, describe, expect, it } from 'vitest';
import { closePostgresStorage, createPostgresStorage } from '../adapters/postgres';
import { createTestDB } from './setup';

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
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

    expect(version?.version).toBe(62);
    expect(tables).toEqual({
      preparations: 'transition_proposal_preparations',
      verification_receipts: 'transition_verification_receipts',
    });
  });

  it('upgrades a v61 database with the complete v62 YSchema registry', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      DROP TABLE yschema_composition_snapshots;
      DROP TABLE yschema_artifact_capabilities;
      DROP TABLE yschema_artifact_versions;
      DROP TABLE yschema_artifacts;
      UPDATE _schema_version SET version = 61 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [tables] = await setup.sql.unsafe<
      Array<{
        artifacts: string | null;
        artifactVersions: string | null;
        artifactCapabilities: string | null;
        compositionSnapshots: string | null;
      }>
    >(`
      SELECT
        to_regclass('public.yschema_artifacts')::text AS artifacts,
        to_regclass('public.yschema_artifact_versions')::text AS "artifactVersions",
        to_regclass('public.yschema_artifact_capabilities')::text AS "artifactCapabilities",
        to_regclass('public.yschema_composition_snapshots')::text AS "compositionSnapshots"
    `);

    expect(version?.version).toBe(62);
    expect(tables).toEqual({
      artifacts: 'yschema_artifacts',
      artifactVersions: 'yschema_artifact_versions',
      artifactCapabilities: 'yschema_artifact_capabilities',
      compositionSnapshots: 'yschema_composition_snapshots',
    });
  });
});
