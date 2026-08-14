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

    expect(version?.version).toBe(63);
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

    expect(version?.version).toBe(63);
    expect(tables).toEqual({
      artifacts: 'yschema_artifacts',
      artifactVersions: 'yschema_artifact_versions',
      artifactCapabilities: 'yschema_artifact_capabilities',
      compositionSnapshots: 'yschema_composition_snapshots',
    });
  });

  it('upgrades v62 templates with provenance and a retained audit ledger', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      DROP TABLE template_audit_log;
      ALTER TABLE templates DROP COLUMN provenance;
      ALTER TABLE templates DROP COLUMN owner_id;
      INSERT INTO templates (
        template_id, title, description, category, leaf_type, system_prompt,
        user_prompt, variables, tags, is_builtin, created_at, updated_at
      ) VALUES (
        'tmpl_v62_legacy', 'Legacy', 'Legacy row', 'social', 'tweet', 'system',
        'user', '[]'::jsonb, '[]'::jsonb, FALSE, NOW(), NOW()
      );
      UPDATE _schema_version SET version = 62 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [template] = await setup.sql.unsafe<
      Array<{ owner_id: string | null; provenance: Record<string, string> }>
    >(`SELECT owner_id, provenance FROM templates WHERE template_id = 'tmpl_v62_legacy'`);
    const [audit] = await setup.sql.unsafe<Array<{ action: string; snapshotId: string }>>(`
      SELECT action, snapshot->>'template_id' AS "snapshotId"
      FROM template_audit_log
      WHERE template_id = 'tmpl_v62_legacy'
    `);

    expect(version?.version).toBe(63);
    expect(template).toEqual({
      owner_id: null,
      provenance: {
        source: 'legacy',
        actor_kind: 'system',
        actor_id: 'schema-migration',
      },
    });
    expect(audit).toEqual({ action: 'migrate', snapshotId: 'tmpl_v62_legacy' });
  });
});
