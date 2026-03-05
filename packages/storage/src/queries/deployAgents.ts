/**
 * Deploy Agents Queries
 *
 * CRUD operations for deploy agents using Drizzle ORM.
 * Note: This is different from the "agent" layer (LLM draft generation)
 */

import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type DeployAgent, deployAgents, type NewDeployAgent } from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface CreateDeployAgentInput {
  id: string;
  name: string;
  endpoint: string;
  type?: 'http' | 'websocket' | 'grpc';
  projectId?: string;
  auth?: {
    type: 'bearer' | 'api_key';
    token: string;
    header?: string;
  };
}

export interface UpdateDeployAgentInput {
  name?: string;
  endpoint?: string;
  type?: 'http' | 'websocket' | 'grpc';
  auth?: {
    type: 'bearer' | 'api_key';
    token: string;
    header?: string;
  } | null;
  status?: 'idle' | 'running' | 'error';
  lastRunId?: string;
  lastRunAt?: Date;
}

export interface ListDeployAgentsOptions {
  projectId?: string;
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

/**
 * Insert a new deploy agent
 */
export async function insertDeployAgent(
  db: AnyDB,
  input: CreateDeployAgentInput
): Promise<DeployAgent> {
  const now = new Date();

  const [agent] = await db
    .insert(deployAgents)
    .values({
      deployAgentId: input.id,
      projectId: input.projectId ?? null,
      name: input.name,
      endpoint: input.endpoint,
      type: input.type ?? 'http',
      authJson: input.auth ? JSON.stringify(input.auth) : null,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return agent;
}

/**
 * Find deploy agent by ID
 */
export async function findDeployAgentById(
  db: AnyDB,
  deployAgentId: string
): Promise<DeployAgent | null> {
  const [agent] = await db
    .select()
    .from(deployAgents)
    .where(eq(deployAgents.deployAgentId, deployAgentId))
    .limit(1);

  return agent ?? null;
}

/**
 * Find all deploy agents, optionally filtered by project
 */
export async function findDeployAgents(
  db: AnyDB,
  options: ListDeployAgentsOptions & { cursor: string }
): Promise<CursorPage<DeployAgent>>;
export async function findDeployAgents(
  db: AnyDB,
  options?: Omit<ListDeployAgentsOptions, 'cursor'>
): Promise<DeployAgent[]>;
export async function findDeployAgents(
  db: AnyDB,
  options: ListDeployAgentsOptions = {}
): Promise<DeployAgent[] | CursorPage<DeployAgent>> {
  const limit = options.limit ?? 100;

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [];
    if (options.projectId) {
      conditions.push(eq(deployAgents.projectId, options.projectId));
    }

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      const cursorDate = new Date(t);
      // Keyset: (created_at < t) OR (created_at = t AND deploy_agent_id < k)
      conditions.push(
        or(
          lt(deployAgents.createdAt, cursorDate),
          and(eq(deployAgents.createdAt, cursorDate), lt(deployAgents.deployAgentId, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(deployAgents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deployAgents.createdAt), desc(deployAgents.deployAgentId))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (a) => ({
      t: a.createdAt.toISOString(),
      k: a.deployAgentId,
    }));
  }

  // Legacy offset/limit mode
  const offset = options.offset ?? 0;
  if (options.projectId) {
    return db
      .select()
      .from(deployAgents)
      .where(eq(deployAgents.projectId, options.projectId))
      .orderBy(desc(deployAgents.createdAt))
      .limit(limit)
      .offset(offset);
  }

  return db
    .select()
    .from(deployAgents)
    .orderBy(desc(deployAgents.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update a deploy agent
 *
 * Fix: Removed preliminary findDeployAgentById (TOCTOU). The UPDATE ... RETURNING
 * itself tells us whether the row existed: 0 rows returned means not found.
 */
export async function updateDeployAgent(
  db: AnyDB,
  deployAgentId: string,
  updates: UpdateDeployAgentInput
): Promise<DeployAgent | null> {
  const updateData: Partial<NewDeployAgent> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.endpoint !== undefined) {
    updateData.endpoint = updates.endpoint;
  }
  if (updates.type !== undefined) {
    updateData.type = updates.type;
  }
  if (updates.auth !== undefined) {
    updateData.authJson = updates.auth ? JSON.stringify(updates.auth) : null;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.lastRunId !== undefined) {
    updateData.lastRunId = updates.lastRunId;
  }
  if (updates.lastRunAt !== undefined) {
    updateData.lastRunAt = updates.lastRunAt;
  }

  const [updated] = await db
    .update(deployAgents)
    .set(updateData)
    .where(eq(deployAgents.deployAgentId, deployAgentId))
    .returning();

  return updated ?? null;
}

/**
 * Delete a deploy agent
 */
export async function deleteDeployAgent(db: AnyDB, deployAgentId: string): Promise<boolean> {
  const result = await db
    .delete(deployAgents)
    .where(eq(deployAgents.deployAgentId, deployAgentId))
    .returning();

  return result.length > 0;
}

/**
 * Update deploy agent run status
 */
export async function updateDeployAgentRunStatus(
  db: AnyDB,
  deployAgentId: string,
  status: 'idle' | 'running' | 'error',
  lastRunId?: string
): Promise<DeployAgent | null> {
  return updateDeployAgent(db, deployAgentId, {
    status,
    lastRunId,
    lastRunAt: lastRunId ? new Date() : undefined,
  });
}
