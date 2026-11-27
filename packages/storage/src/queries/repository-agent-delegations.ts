import type { TransitionScope } from '@t3x-dev/core';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { apiKeys, projectGrants, repositoryAgentDelegations } from '../schema-trees';

export type DelegationMode = 'read' | 'prepare' | 'commit';
export interface DelegationOptions {
  branch: string;
  branchOnly: boolean;
  mode: DelegationMode;
  days: number;
}

const columns = {
  id: apiKeys.id,
  clientId: repositoryAgentDelegations.clientId,
  revision: repositoryAgentDelegations.revision,
  projectId: apiKeys.projectId,
  userId: apiKeys.userId,
  agentName: apiKeys.name,
  branch: repositoryAgentDelegations.branch,
  branchOnly: repositoryAgentDelegations.branchOnly,
  mode: repositoryAgentDelegations.mode,
  expiresAt: apiKeys.expiresAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
};

export async function readAgentDelegation(db: AnyDB, id: string, lock = false) {
  const query = db
    .select(columns)
    .from(repositoryAgentDelegations)
    .innerJoin(apiKeys, eq(apiKeys.id, repositoryAgentDelegations.keyId))
    .where(eq(apiKeys.id, id))
    .limit(1);
  const [row] = await (lock ? query.for('share') : query);
  return row ?? null;
}

export async function selectAgentDelegations(db: AnyDB, projectId: string, userId: string) {
  return db
    .select(columns)
    .from(repositoryAgentDelegations)
    .innerJoin(apiKeys, eq(apiKeys.id, repositoryAgentDelegations.keyId))
    .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.userId, userId)))
    .orderBy(desc(apiKeys.createdAt));
}

/** Serialize rotation, revocation and permission edits for one client and delegator. */
export async function lockAgentDelegation(
  db: AnyDB,
  projectId: string,
  userId: string,
  clientId: string
) {
  const subject = JSON.stringify([projectId, userId, clientId]);
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${subject}, 190))`);
}
export async function recordAgentDelegation(
  db: AnyDB,
  keyId: string,
  clientId: string,
  options: DelegationOptions
) {
  await db.insert(repositoryAgentDelegations).values({
    keyId,
    clientId,
    branch: options.branch,
    branchOnly: options.branchOnly,
    mode: options.mode,
  });
}
export async function adjustAgentDelegation(
  db: AnyDB,
  id: string,
  projectId: string,
  options: DelegationOptions,
  expiresAt: Date,
  scopes: TransitionScope[]
) {
  const [active] = await db
    .update(apiKeys)
    .set({ expiresAt, transitionScopes: scopes })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (!active) return false;
  await db
    .update(repositoryAgentDelegations)
    .set({
      mode: options.mode,
      branch: options.branch,
      branchOnly: options.branchOnly,
      revision: sql`${repositoryAgentDelegations.revision} + 1`,
    })
    .where(eq(repositoryAgentDelegations.keyId, id));
  await db
    .update(projectGrants)
    .set({ role: options.mode === 'read' ? 'viewer' : 'editor', updatedAt: new Date() })
    .where(
      and(
        eq(projectGrants.projectId, projectId),
        eq(projectGrants.principalKind, 'agent'),
        eq(projectGrants.principalId, id)
      )
    );
  return true;
}
