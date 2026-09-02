import { afterEach, describe, expect, it } from 'vitest';
import {
  closePostgresStorage,
  createPostgresBootstrapStorage,
  createPostgresRuntimeStorage,
  createPostgresStorage,
  getPostgresClient,
  POSTGRES_SCHEMA_VERSION,
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
    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
  });

  it('rolls back the complete schema transaction when an upgrade step fails', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      DROP TABLE collaboration_invitations;
      DROP TABLE project_grants;
      DROP TABLE namespace_memberships;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS uq_projects_id_namespace;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_namespace;
      DROP TABLE namespaces;
      CREATE TABLE namespaces (incompatible INTEGER);
      DROP TABLE rate_limit_buckets;
      UPDATE _schema_version SET version = 67 WHERE singleton = TRUE;
    `);

    await expect(
      createPostgresBootstrapStorage({
        connectionString: setup.connectionString,
        maxConnections: 1,
        onnotice: () => {},
      })
    ).rejects.toThrow();

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [table] = await setup.sql.unsafe<Array<{ rateLimitBuckets: string | null }>>(
      `SELECT to_regclass('public.rate_limit_buckets')::text AS "rateLimitBuckets"`
    );
    expect(version?.version).toBe(67);
    expect(table?.rateLimitBuckets).toBeNull();
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
    expect(table).toEqual({ rate_limit_buckets: 'rate_limit_buckets' });
  });

  it('upgrades a v67 database with namespaces and backfills legacy projects', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      INSERT INTO projects (project_id, name, created_at)
      VALUES ('project_before_namespaces', 'Legacy project', NOW());
      DROP TABLE collaboration_invitations;
      DROP TABLE project_grants;
      DROP TABLE namespace_memberships;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS uq_projects_id_namespace;
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

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
    expect(project?.namespace_id).toBe('ns_t3x_dev');
    expect(namespace).toEqual({ slug: 't3x-dev', kind: 'organization' });
  });

  it('upgrades a v68 database with fail-closed memberships and tenant-bound grants', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      INSERT INTO users (id, email_verified)
      VALUES ('user_personal_owner', TRUE);
      INSERT INTO namespaces (
        namespace_id, slug, kind, owner_user_id, display_name
      ) VALUES (
        'ns_personal_owner', 'personal-owner', 'personal',
        'user_personal_owner', 'Personal Owner'
      );
      INSERT INTO projects (project_id, name, namespace_id, created_at)
      VALUES ('project_personal', 'Personal project', 'ns_personal_owner', NOW());
      DROP TABLE collaboration_invitations;
      DROP TABLE project_grants;
      DROP TABLE namespace_memberships;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS uq_projects_id_namespace;
      UPDATE _schema_version SET version = 68 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const memberships = await setup.sql.unsafe<
      Array<{
        namespace_id: string;
        principal_kind: string;
        principal_id: string;
        role: string;
        status: string;
      }>
    >(`
      SELECT namespace_id, principal_kind, principal_id, role, status
      FROM namespace_memberships
      ORDER BY namespace_id
    `);

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
    expect(memberships).toEqual([
      {
        namespace_id: 'ns_personal_owner',
        principal_kind: 'human',
        principal_id: 'user_personal_owner',
        role: 'owner',
        status: 'active',
      },
    ]);

    await expect(
      setup.sql.unsafe(`
        INSERT INTO namespace_memberships (
          membership_id, namespace_id, principal_kind, principal_id, role, status
        ) VALUES (
          'nsm_invalid_service_owner', 'ns_personal_owner', 'service',
          'service_invalid', 'owner', 'active'
        )
      `)
    ).rejects.toThrow();
    await expect(
      setup.sql.unsafe(`
        INSERT INTO project_grants (
          grant_id, project_id, namespace_id, principal_kind, principal_id, role, status
        ) VALUES (
          'pg_cross_tenant', 'project_personal', 'ns_t3x_dev',
          'human', 'user_guest', 'viewer', 'active'
        )
      `)
    ).rejects.toThrow();
    await expect(
      setup.sql.unsafe(`
        INSERT INTO project_grants (
          grant_id, project_id, namespace_id, principal_kind, principal_id, role, status
        ) VALUES (
          'pg_owner_role', 'project_personal', 'ns_personal_owner',
          'human', 'user_guest', 'owner', 'active'
        )
      `)
    ).rejects.toThrow();
  });

  it('upgrades a v69 database with expiring grants and recipient-bound invitations', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      INSERT INTO projects (project_id, name, namespace_id, created_at)
      VALUES ('project_before_invites', 'Existing grant project', 'ns_t3x_dev', NOW());
      INSERT INTO project_grants (
        grant_id, project_id, namespace_id, principal_kind, principal_id, role, status
      ) VALUES (
        'grant_before_expiry', 'project_before_invites', 'ns_t3x_dev',
        'human', 'user_existing_guest', 'viewer', 'active'
      );
      DROP TABLE collaboration_invitations;
      ALTER TABLE project_grants DROP CONSTRAINT project_grants_expiry_check;
      ALTER TABLE project_grants DROP COLUMN expires_at;
      UPDATE _schema_version SET version = 69 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [grant] = await setup.sql.unsafe<Array<{ expires_at: Date | null }>>(`
      SELECT expires_at FROM project_grants WHERE grant_id = 'grant_before_expiry'
    `);
    const [invitationTable] = await setup.sql.unsafe<Array<{ table_name: string | null }>>(`
      SELECT to_regclass('public.collaboration_invitations')::text AS table_name
    `);

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
    expect(grant?.expires_at).toBeNull();
    expect(invitationTable?.table_name).toBe('collaboration_invitations');

    await expect(
      setup.sql.unsafe(`
        INSERT INTO collaboration_invitations (
          invitation_id, namespace_id, recipient_email, role, token_hash,
          created_by_principal_kind, created_by_principal_id, expires_at
        ) VALUES (
          'invite_owner_role', 'ns_t3x_dev', 'owner@example.com', 'owner',
          'hash_owner_role', 'human', 'user_inviter', NOW() + INTERVAL '1 day'
        )
      `)
    ).rejects.toThrow();
  });

  it('upgrades a v70 database with fail-closed project visibility', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      ALTER TABLE projects DROP CONSTRAINT projects_visibility_check;
      DROP INDEX idx_projects_visibility_created;
      ALTER TABLE projects DROP COLUMN visibility;
      INSERT INTO projects (project_id, name, owner_id, namespace_id, created_at)
      VALUES
        ('project_owned_legacy', 'Owned legacy', 'user_legacy', 'ns_t3x_dev', NOW()),
        ('project_unowned_legacy', 'Unowned legacy', NULL, 'ns_t3x_dev', NOW());
      UPDATE _schema_version SET version = 70 WHERE singleton = TRUE;
    `);

    await createPostgresStorage({
      connectionString: setup.connectionString,
      maxConnections: 1,
      onnotice: () => {},
    });

    const rows = await setup.sql.unsafe<Array<{ project_id: string; visibility: string }>>(`
      SELECT project_id, visibility
      FROM projects
      WHERE project_id IN ('project_owned_legacy', 'project_unowned_legacy')
      ORDER BY project_id
    `);
    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );

    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION);
    expect(rows).toEqual([
      { project_id: 'project_owned_legacy', visibility: 'private' },
      { project_id: 'project_unowned_legacy', visibility: 'private' },
    ]);

    await expect(
      setup.sql.unsafe(
        "UPDATE projects SET visibility = 'discoverable' WHERE project_id = 'project_owned_legacy'"
      )
    ).rejects.toThrow();
  });

  it('runtime startup neither repairs an old schema nor refreshes builtin seeds', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe(`
      UPDATE templates
      SET title = 'runtime must preserve this title'
      WHERE template_id = (SELECT template_id FROM templates WHERE is_builtin = TRUE LIMIT 1);
      UPDATE _schema_version
      SET version = ${POSTGRES_SCHEMA_VERSION - 1}
      WHERE singleton = TRUE;
    `);

    await expect(
      createPostgresRuntimeStorage({
        connectionString: setup.connectionString,
        maxConnections: 1,
        onnotice: () => {},
      })
    ).rejects.toThrow(/migratePostgresStorage.*no DDL or seed repair/i);

    const [version] = await setup.sql.unsafe<{ version: number }[]>(
      'SELECT version FROM _schema_version WHERE singleton = TRUE'
    );
    const [template] = await setup.sql.unsafe<Array<{ title: string }>>(
      "SELECT title FROM templates WHERE title = 'runtime must preserve this title'"
    );
    expect(version?.version).toBe(POSTGRES_SCHEMA_VERSION - 1);
    expect(template?.title).toBe('runtime must preserve this title');
  });

  it('runtime startup leaves a missing schema missing', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;

    await closePostgresStorage();
    await setup.sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public');

    await expect(
      createPostgresRuntimeStorage({
        connectionString: setup.connectionString,
        maxConnections: 1,
        onnotice: () => {},
      })
    ).rejects.toThrow(/schema is missing.*migratePostgresStorage/i);

    const [schema] = await setup.sql.unsafe<Array<{ versionTable: string | null }>>(
      `SELECT to_regclass('public._schema_version')::text AS "versionTable"`
    );
    expect(schema?.versionTable).toBeNull();
  });

  it('starts and reads/writes application data as a non-owner NOINHERIT runtime role', async () => {
    const setup = await createTestDB();
    cleanup = setup.cleanup;
    await closePostgresStorage();

    const role = `t3x_runtime_${Math.random().toString(36).slice(2, 10)}`;
    const password = `runtime_${Math.random().toString(36).slice(2, 14)}`;
    const database = new URL(setup.connectionString).pathname.slice(1);
    let roleCreated = false;

    try {
      await setup.sql.unsafe(`CREATE ROLE "${role}" LOGIN NOINHERIT PASSWORD '${password}'`);
      roleCreated = true;
      await setup.sql.unsafe(`
        GRANT CONNECT ON DATABASE "${database}" TO "${role}";
        GRANT USAGE ON SCHEMA public TO "${role}";
        REVOKE CREATE ON SCHEMA public FROM "${role}";
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}";
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}";
      `);

      const runtimeUrl = new URL(setup.connectionString);
      runtimeUrl.username = role;
      runtimeUrl.password = password;
      await createPostgresRuntimeStorage({
        connectionString: runtimeUrl.toString(),
        maxConnections: 1,
        onnotice: () => {},
      });
      const runtimeSql = getPostgresClient();
      const [identity] = await runtimeSql.unsafe<
        Array<{
          currentUser: string;
          tableOwner: string;
          canCreate: boolean;
          ownsOrInheritsOwner: boolean;
        }>
      >(`
        SELECT
          current_user AS "currentUser",
          tableowner AS "tableOwner",
          has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreate",
          pg_has_role(current_user, tableowner, 'MEMBER') AS "ownsOrInheritsOwner"
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'projects'
      `);

      expect(identity).toMatchObject({
        currentUser: role,
        canCreate: false,
        ownsOrInheritsOwner: false,
      });
      expect(identity?.tableOwner).not.toBe(role);
      await expect(runtimeSql.unsafe(`SET ROLE "${identity?.tableOwner}"`)).rejects.toThrow();
      await expect(
        runtimeSql.unsafe('CREATE TABLE runtime_role_forbidden (id INTEGER)')
      ).rejects.toThrow();

      await runtimeSql.unsafe(`
        INSERT INTO projects (project_id, name, created_at)
        VALUES ('runtime_role_project', 'Runtime role project', NOW())
      `);
      const [project] = await runtimeSql.unsafe<Array<{ name: string }>>(
        "SELECT name FROM projects WHERE project_id = 'runtime_role_project'"
      );
      expect(project?.name).toBe('Runtime role project');
      await runtimeSql.unsafe("DELETE FROM projects WHERE project_id = 'runtime_role_project'");
    } finally {
      await closePostgresStorage();
      if (roleCreated) {
        await setup.sql.unsafe(`DROP OWNED BY "${role}"`);
        await setup.sql.unsafe(`DROP ROLE "${role}"`);
      }
    }
  });
});
