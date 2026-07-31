import { describe, expect, it } from 'vitest';
import { closePostgresStorage, createPostgresStorage } from '../adapters/postgres';
import { listWorkspaceDrafts } from '../queries/drafts';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('workspace and Transition schema migrations', () => {
  it('keeps the newest open workspace per branch when upgrading from v51', async () => {
    const testDb = await createTestDB();

    try {
      const project = await insertProject(
        testDb.db,
        testData.project({ name: 'Workspace Branch Migration Test' })
      );
      const oldUpdatedAt = new Date('2026-07-23T08:00:00.000Z');
      const newUpdatedAt = new Date('2026-07-24T08:00:00.000Z');

      await testDb.sql.unsafe('DROP INDEX IF EXISTS idx_drafts_open_workspace_branch');
      await testDb.sql`
        INSERT INTO drafts (
          id,
          project_id,
          title,
          status,
          target_branch,
          workspace_id,
          workspace_state_json,
          created_at,
          updated_at
        ) VALUES
          (
            'draft_workspace_migration_old',
            ${project.projectId},
            'Old workspace',
            'editing',
            'feature/migration',
            'workspace_migration_old',
            jsonb_build_object(
              'id', 'workspace_migration_old',
              'projectId', CAST(${project.projectId} AS TEXT),
              'status', 'draft',
              'targetBranch', 'feature/migration'
            ),
            ${oldUpdatedAt},
            ${oldUpdatedAt}
          ),
          (
            'draft_workspace_migration_new',
            ${project.projectId},
            'New workspace',
            'editing',
            'feature/migration',
            'workspace_migration_new',
            jsonb_build_object(
              'id', 'workspace_migration_new',
              'projectId', CAST(${project.projectId} AS TEXT),
              'status', 'draft',
              'targetBranch', 'feature/migration'
            ),
            ${newUpdatedAt},
            ${newUpdatedAt}
          )
      `;
      await testDb.sql`
        UPDATE _schema_version
        SET version = 51, applied_at = NOW()
        WHERE singleton = TRUE
      `;

      await closePostgresStorage();
      const migratedDb = await createPostgresStorage({
        connectionString: testDb.connectionString,
      });

      const rows = await testDb.sql<Array<{ status: string; workspace_id: string }>>`
        SELECT status, workspace_id
        FROM drafts
        WHERE project_id = ${project.projectId}
          AND target_branch = 'feature/migration'
        ORDER BY workspace_id
      `;
      expect(rows).toEqual([
        { status: 'editing', workspace_id: 'workspace_migration_new' },
        { status: 'abandoned', workspace_id: 'workspace_migration_old' },
      ]);

      const visibleWorkspaces = await listWorkspaceDrafts(migratedDb, project.projectId);
      expect(visibleWorkspaces.map((draft) => draft.workspace_id)).toEqual([
        'workspace_migration_new',
      ]);

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(56);

      const [index] = await testDb.sql<Array<{ index_name: string | null }>>`
        SELECT to_regclass('idx_drafts_open_workspace_branch')::text AS index_name
      `;
      expect(index?.index_name).toBe('idx_drafts_open_workspace_branch');
    } finally {
      await testDb.cleanup();
    }
  });

  it('installs Transition tables when upgrading an existing UI schema from v52', async () => {
    const testDb = await createTestDB();

    try {
      await testDb.sql.unsafe(`
        DROP TABLE IF EXISTS transition_decision_ledger;
        DROP TABLE IF EXISTS transition_decision_authorizations;
        DROP TABLE IF EXISTS transition_commits;
        DROP TABLE IF EXISTS transition_objects;
        UPDATE _schema_version
        SET version = 52, applied_at = NOW()
        WHERE singleton = TRUE;
      `);

      await closePostgresStorage();
      await createPostgresStorage({ connectionString: testDb.connectionString });

      const [tables] = await testDb.sql<
        Array<{
          objects: string | null;
          commits: string | null;
          authorizations: string | null;
          ledger: string | null;
        }>
      >`
        SELECT
          to_regclass('transition_objects')::text AS objects,
          to_regclass('transition_commits')::text AS commits,
          to_regclass('transition_decision_authorizations')::text AS authorizations,
          to_regclass('transition_decision_ledger')::text AS ledger
      `;
      expect(tables).toEqual({
        objects: 'transition_objects',
        commits: 'transition_commits',
        authorizations: 'transition_decision_authorizations',
        ledger: 'transition_decision_ledger',
      });

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(56);
    } finally {
      await testDb.cleanup();
    }
  });

  it('adds trusted Statement issuer facts when upgrading from v53', async () => {
    const testDb = await createTestDB();

    try {
      await testDb.sql.unsafe(`
        ALTER TABLE transition_decision_authorizations
          DROP COLUMN IF EXISTS statement_issuers;
        UPDATE _schema_version
        SET version = 53, applied_at = NOW()
        WHERE singleton = TRUE;
      `);

      await closePostgresStorage();
      await createPostgresStorage({ connectionString: testDb.connectionString });

      const [column] = await testDb.sql<Array<{ is_nullable: string; column_default: string }>>`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transition_decision_authorizations'
          AND column_name = 'statement_issuers'
      `;
      expect(column?.is_nullable).toBe('NO');
      expect(column?.column_default).toContain("'[]'::jsonb");

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(56);
    } finally {
      await testDb.cleanup();
    }
  });

  it('installs the trusted Decision ledger when upgrading from v54', async () => {
    const testDb = await createTestDB();

    try {
      const project = await insertProject(
        testDb.db,
        testData.project({ name: 'Decision Ledger Migration Test' })
      );
      const decisionDigest = `sha256:${'f'.repeat(64)}`;
      await testDb.sql.unsafe(`
        DROP TABLE IF EXISTS transition_decision_ledger;
        UPDATE _schema_version
        SET version = 54, applied_at = NOW()
        WHERE singleton = TRUE;
      `);
      await testDb.sql`
        INSERT INTO transition_objects (digest, kind, schema, canonical_json)
        VALUES (${decisionDigest}, 'statement', 't3x/statement/v1', '{}')
      `;
      await testDb.sql`
        INSERT INTO transition_decision_authorizations (
          project_id,
          ref_name,
          decision_digest,
          policy_uri,
          policy_digest,
          actor_kind,
          actor_id,
          outcome,
          observation_scope,
          statement_issuers
        ) VALUES (
          ${project.projectId},
          'main',
          ${decisionDigest},
          't3x://project/policies/default',
          ${`sha256:${'e'.repeat(64)}`},
          'human',
          'human:migration',
          'accepted',
          jsonb_build_object('completeness', 'complete', 'sources', jsonb_build_array('store')),
          '[]'::jsonb
        )
      `;

      await closePostgresStorage();
      await createPostgresStorage({ connectionString: testDb.connectionString });

      const [table] = await testDb.sql<Array<{ ledger: string | null }>>`
        SELECT to_regclass('transition_decision_ledger')::text AS ledger
      `;
      expect(table?.ledger).toBe('transition_decision_ledger');
      const [ledger] = await testDb.sql<
        Array<{ decision_digest: string; project_id: string; ref_name: string }>
      >`
        SELECT decision_digest, project_id, ref_name
        FROM transition_decision_ledger
        WHERE decision_digest = ${decisionDigest}
      `;
      expect(ledger).toEqual({
        decision_digest: decisionDigest,
        project_id: project.projectId,
        ref_name: 'main',
      });

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(56);
    } finally {
      await testDb.cleanup();
    }
  });

  it('adds explicit empty Transition authority and policy bindings when upgrading from v55', async () => {
    const testDb = await createTestDB();

    try {
      await testDb.sql.unsafe(`
        DROP TABLE IF EXISTS transition_policy_bindings;
        DROP TABLE IF EXISTS transition_policy_resources;
        ALTER TABLE api_keys DROP COLUMN IF EXISTS transition_scopes;
        ALTER TABLE api_keys DROP COLUMN IF EXISTS principal_kind;
        INSERT INTO api_keys (id, key_prefix, key_hash, name)
        VALUES ('ak_legacy_v55', 't3xk_leg', 'legacy-v55-hash', 'Legacy v55 key');
        UPDATE _schema_version
        SET version = 55, applied_at = NOW()
        WHERE singleton = TRUE;
      `);

      await closePostgresStorage();
      await createPostgresStorage({ connectionString: testDb.connectionString });

      const [legacy] = await testDb.sql<
        Array<{ principal_kind: string; transition_scopes: unknown }>
      >`
        SELECT principal_kind, transition_scopes
        FROM api_keys
        WHERE id = 'ak_legacy_v55'
      `;
      expect(legacy).toEqual({ principal_kind: 'human', transition_scopes: [] });

      const [tables] = await testDb.sql<
        Array<{ resources: string | null; bindings: string | null }>
      >`
        SELECT
          to_regclass('transition_policy_resources')::text AS resources,
          to_regclass('transition_policy_bindings')::text AS bindings
      `;
      expect(tables).toEqual({
        resources: 'transition_policy_resources',
        bindings: 'transition_policy_bindings',
      });

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version FROM _schema_version WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(56);
    } finally {
      await testDb.cleanup();
    }
  });

  it('fails a v54 retry when an existing Decision ledger row conflicts with authority', async () => {
    const testDb = await createTestDB();

    try {
      const authorizedProject = await insertProject(
        testDb.db,
        testData.project({ name: 'Authorized Decision Project' })
      );
      const conflictingProject = await insertProject(
        testDb.db,
        testData.project({ name: 'Conflicting Decision Project' })
      );
      const decisionDigest = `sha256:${'d'.repeat(64)}`;
      const policyDigest = `sha256:${'c'.repeat(64)}`;
      await testDb.sql`
        INSERT INTO transition_objects (digest, kind, schema, canonical_json)
        VALUES (${decisionDigest}, 'statement', 't3x/statement/v1', '{}')
      `;
      await testDb.sql`
        INSERT INTO transition_decision_authorizations (
          project_id,
          ref_name,
          decision_digest,
          policy_uri,
          policy_digest,
          actor_kind,
          actor_id,
          outcome,
          observation_scope,
          statement_issuers
        ) VALUES (
          ${authorizedProject.projectId},
          'main',
          ${decisionDigest},
          't3x://project/policies/default',
          ${policyDigest},
          'human',
          'human:migration',
          'accepted',
          jsonb_build_object('completeness', 'complete', 'sources', jsonb_build_array('store')),
          '[]'::jsonb
        )
      `;
      await testDb.sql`
        INSERT INTO transition_decision_ledger (
          decision_digest,
          project_id,
          ref_name,
          policy_uri,
          policy_digest,
          actor_kind,
          actor_id,
          outcome,
          observation_scope,
          statement_issuers
        ) VALUES (
          ${decisionDigest},
          ${conflictingProject.projectId},
          'other',
          't3x://project/policies/default',
          ${policyDigest},
          'human',
          'human:migration',
          'accepted',
          jsonb_build_object('completeness', 'complete', 'sources', jsonb_build_array('store')),
          '[]'::jsonb
        )
      `;
      await testDb.sql`
        UPDATE _schema_version
        SET version = 54, applied_at = NOW()
        WHERE singleton = TRUE
      `;

      await closePostgresStorage();
      await expect(
        createPostgresStorage({ connectionString: testDb.connectionString })
      ).rejects.toThrow('Cannot migrate a conflicting existing Decision ledger row');

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(54);
    } finally {
      await testDb.cleanup();
    }
  });
});
