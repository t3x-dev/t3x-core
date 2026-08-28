import { afterEach, describe, expect, it } from 'vitest';
import {
  closePostgresStorage,
  createPostgresStorage,
  getPostgresClient,
} from '../adapters/postgres';
import { createTestDB } from './setup';

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('PostgreSQL schema migrations', () => {
  it('serializes concurrent first-run schema initialization', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public');

    const initialized = await Promise.all([
      createPostgresStorage({
        connectionString: setup.connectionString,
        maxConnections: 1,
        onnotice: () => {},
      }),
      createPostgresStorage({
        connectionString: setup.connectionString,
        maxConnections: 1,
        onnotice: () => {},
      }),
    ]);

    const activeClient = getPostgresClient();
    for (const initializedDb of initialized) {
      if (initializedDb.$client !== activeClient) {
        await initializedDb.$client.end();
      }
    }
    await closePostgresStorage();

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    expect(version?.version).toBe(68);
  });

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
      Array<{
        preparations: string | null;
        verification_receipts: string | null;
        review_snapshots: string | null;
      }>
    >(`
      SELECT
        to_regclass('public.transition_proposal_preparations')::text AS preparations,
        to_regclass('public.transition_verification_receipts')::text AS verification_receipts,
        to_regclass('public.transition_review_snapshots')::text AS review_snapshots
    `);

    expect(version?.version).toBe(68);
    expect(tables).toEqual({
      preparations: 'transition_proposal_preparations',
      verification_receipts: 'transition_verification_receipts',
      review_snapshots: 'transition_review_snapshots',
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

    expect(version?.version).toBe(68);
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

    expect(version?.version).toBe(68);
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

  it('upgrades v64 merge drafts with a separate decision revision', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      ALTER TABLE merge_drafts DROP COLUMN decision_json;
      ALTER TABLE merge_drafts DROP COLUMN decision_revision;
      UPDATE _schema_version SET version = 64 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const columns = await setup.sql.unsafe<Array<{ column_name: string }>>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'merge_drafts'
        AND column_name IN ('decision_json', 'decision_revision')
      ORDER BY column_name
    `);

    expect(version?.version).toBe(68);
    expect(columns.map((column) => column.column_name)).toEqual([
      'decision_json',
      'decision_revision',
    ]);
  });

  it('upgrades a v65 database with immutable Transition review snapshots', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      DROP TABLE transition_review_snapshots;
      UPDATE _schema_version SET version = 65 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [tables] = await setup.sql.unsafe<Array<{ review_snapshots: string | null }>>(`
      SELECT to_regclass('public.transition_review_snapshots')::text AS review_snapshots
    `);

    expect(version?.version).toBe(68);
    expect(tables).toEqual({ review_snapshots: 'transition_review_snapshots' });
  });

  it('upgrades a v66 database with persistent rate-limit buckets', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      DROP TABLE rate_limit_buckets;
      UPDATE _schema_version SET version = 66 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [table] = await setup.sql.unsafe<Array<{ rate_limit_buckets: string | null }>>(`
      SELECT to_regclass('public.rate_limit_buckets')::text AS rate_limit_buckets
    `);

    expect(version?.version).toBe(68);
    expect(table).toEqual({ rate_limit_buckets: 'rate_limit_buckets' });
  });

  it('upgrades a v67 database with namespaces and backfills legacy projects', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      INSERT INTO projects (project_id, name, created_at)
      VALUES ('project_before_namespaces', 'Legacy project', NOW());
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_namespace;
      ALTER TABLE projects DROP COLUMN namespace_id;
      DROP TABLE namespaces;
      UPDATE _schema_version SET version = 67 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [project] = await setup.sql.unsafe<Array<{ namespace_id: string | null }>>(
      "SELECT namespace_id FROM projects WHERE project_id = 'project_before_namespaces'"
    );
    const [namespace] = await setup.sql.unsafe<Array<{ slug: string; kind: string }>>(
      "SELECT slug, kind FROM namespaces WHERE namespace_id = 'ns_t3x_dev'"
    );

    expect(version?.version).toBe(68);
    expect(project?.namespace_id).toBe('ns_t3x_dev');
    expect(namespace).toEqual({ slug: 't3x-dev', kind: 'organization' });
  });
});
