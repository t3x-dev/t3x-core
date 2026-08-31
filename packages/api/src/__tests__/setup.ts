/**
 * Test Setup for Hono API
 *
 * Creates an isolated embedded PostgreSQL database for each test file.
 */

import type { ApiKey } from '@t3x-dev/core';
import { and, eq } from 'drizzle-orm';
import { createTestDB } from '../../../storage/src/__tests__/setup';
import type { AnyDB } from '../../../storage/src/adapters';
import { DEFAULT_ORGANIZATION_NAMESPACE_ID } from '../../../storage/src/queries/namespaces';
import { projects } from '../../../storage/src/schema';
import { projectGrants } from '../../../storage/src/schema-trees';
import type { RateLimitStore } from '../middleware/rate-limit';

process.env.T3X_CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32, 0x42).toString('base64');
// Route tests run in the self-hosted local composition unless a boundary test
// explicitly enables authentication. This keeps the local bypass deliberate
// now that production project access fails closed without a principal.
process.env.AUTH_DISABLED ??= 'true';
// CI supplies an external PostgreSQL service. Tests own that disposable database,
// so select the explicit bootstrap path instead of exercising production's
// fail-closed runtime startup against an intentionally empty schema.
process.env.T3X_POSTGRES_STARTUP_MODE ??= 'bootstrap';

export async function setupTestDB(): Promise<{
  db: Awaited<ReturnType<typeof createTestDB>>['db'];
  /** Raw postgres.js Sql for direct SQL execution in tests */
  sql: Awaited<ReturnType<typeof createTestDB>>['sql'];
  cleanup: () => Promise<void>;
}> {
  const setup = await createTestDB();

  // Historical API fixtures commonly create an owned project directly. Make
  // those fixtures represent the production lifecycle by materializing a
  // personal namespace and owner membership before the insert completes. This
  // is test-only compatibility; runtime authorization never reads owner_id.
  if (typeof (setup.sql as { unsafe?: unknown }).unsafe === 'function') {
    await setup.sql.unsafe(`
      CREATE OR REPLACE FUNCTION t3x_test_canonicalize_owned_project()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $test_fixture$
      DECLARE
        canonical_namespace_id TEXT;
      BEGIN
        IF NEW.owner_id IS NULL OR NEW.namespace_id IS NOT NULL THEN
          RETURN NEW;
        END IF;

        SELECT namespace_id INTO canonical_namespace_id
        FROM namespaces
        WHERE kind = 'personal' AND owner_user_id = NEW.owner_id;

        IF canonical_namespace_id IS NULL THEN
          canonical_namespace_id := 'ns_test_' || md5(NEW.owner_id);
          INSERT INTO namespaces (
            namespace_id,
            slug,
            kind,
            owner_user_id,
            display_name
          ) VALUES (
            canonical_namespace_id,
            'test-' || substring(md5(NEW.owner_id) FROM 1 FOR 20),
            'personal',
            NEW.owner_id,
            NEW.owner_id
          );
        END IF;

        INSERT INTO namespace_memberships (
          membership_id,
          namespace_id,
          principal_kind,
          principal_id,
          role,
          status
        ) VALUES (
          'nsm_test_' || md5(NEW.owner_id),
          canonical_namespace_id,
          'human',
          NEW.owner_id,
          'owner',
          'active'
        ) ON CONFLICT (namespace_id, principal_kind, principal_id) DO NOTHING;

        NEW.namespace_id := canonical_namespace_id;
        RETURN NEW;
      END;
      $test_fixture$;

      DROP TRIGGER IF EXISTS t3x_test_canonicalize_owned_project ON projects;
      CREATE TRIGGER t3x_test_canonicalize_owned_project
      BEFORE INSERT ON projects
      FOR EACH ROW
      EXECUTE FUNCTION t3x_test_canonicalize_owned_project();
    `);
  }

  return setup;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

/** Keep createApp integration tests isolated from the runtime PostgreSQL singleton. */
export function createTestRateLimitStore(): RateLimitStore {
  return {
    async consume(input) {
      return {
        allowed: true,
        count: 1,
        remaining: input.limit - 1,
        resetAt: (input.now ?? Date.now()) + input.windowMs,
      };
    },
  };
}

/**
 * Materialize the collaboration grant represented by a machine credential in
 * route fixtures that construct ApiKey context directly instead of calling
 * the real createApiKey lifecycle.
 */
export async function grantTestMachineProjectAccess(db: AnyDB, apiKey: ApiKey): Promise<void> {
  if (apiKey.principal_kind === 'human' || !apiKey.project_id) return;

  await grantTestScopedCredentialProjectAccess(db, apiKey);
}

/** Materialize project authority for any explicitly project-scoped test credential. */
export async function grantTestScopedCredentialProjectAccess(
  db: AnyDB,
  apiKey: ApiKey
): Promise<void> {
  if (!apiKey.project_id) return;
  const principalId = apiKey.principal_kind === 'human' ? apiKey.user_id : apiKey.id;
  if (!principalId) throw new Error(`Test credential ${apiKey.id} has no canonical principal`);

  const [project] = await db
    .select({ namespaceId: projects.namespaceId })
    .from(projects)
    .where(eq(projects.projectId, apiKey.project_id))
    .limit(1);
  if (!project) throw new Error(`Test project not found: ${apiKey.project_id}`);

  const namespaceId = project.namespaceId ?? DEFAULT_ORGANIZATION_NAMESPACE_ID;
  if (!project.namespaceId) {
    await db.update(projects).set({ namespaceId }).where(eq(projects.projectId, apiKey.project_id));
  }

  await db
    .insert(projectGrants)
    .values({
      grantId: `grant_test_${apiKey.id}_${apiKey.project_id}`,
      projectId: apiKey.project_id,
      namespaceId,
      principalKind: apiKey.principal_kind,
      principalId,
      role: 'editor',
      status: 'active',
    })
    .onConflictDoNothing();

  await db
    .update(projectGrants)
    .set({ status: 'active', revokedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(projectGrants.projectId, apiKey.project_id),
        eq(projectGrants.principalKind, apiKey.principal_kind),
        eq(projectGrants.principalId, principalId)
      )
    );
}

export const testData = {
  project: (overrides: { name?: string; metadata?: Record<string, unknown> } = {}) => ({
    name: overrides.name ?? `Test Project ${generateId('proj')}`,
    metadata: overrides.metadata,
  }),
  conversation: (projectId: string, overrides: { title?: string } = {}) => ({
    projectId,
    title: overrides.title ?? `Test Conversation ${generateId('conv')}`,
  }),
  turn: (
    projectId: string,
    conversationId: string,
    overrides: { role?: 'user' | 'assistant' | 'system' | 'tool'; content?: string } = {}
  ) => ({
    projectId,
    conversationId,
    role: overrides.role ?? 'user',
    content: overrides.content ?? `Test message ${generateId('msg')}`,
  }),
};
