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
      expect(schemaVersion?.version).toBe(53);

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
        }>
      >`
        SELECT
          to_regclass('transition_objects')::text AS objects,
          to_regclass('transition_commits')::text AS commits,
          to_regclass('transition_decision_authorizations')::text AS authorizations
      `;
      expect(tables).toEqual({
        objects: 'transition_objects',
        commits: 'transition_commits',
        authorizations: 'transition_decision_authorizations',
      });

      const [schemaVersion] = await testDb.sql<Array<{ version: number }>>`
        SELECT version
        FROM _schema_version
        WHERE singleton = TRUE
      `;
      expect(schemaVersion?.version).toBe(53);
    } finally {
      await testDb.cleanup();
    }
  });
});
