/**
 * Deploy Agents Queries
 *
 * CRUD operations for deploy agents using Drizzle ORM.
 * Note: This is different from the "agent" layer (LLM draft generation)
 */

import { desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type DeployAgent, deployAgents, type NewDeployAgent } from '../schema';

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
  options: ListDeployAgentsOptions = {}
): Promise<DeployAgent[]> {
  const limit = options.limit ?? 100;
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
 */
export async function updateDeployAgent(
  db: AnyDB,
  deployAgentId: string,
  updates: UpdateDeployAgentInput
): Promise<DeployAgent | null> {
  const existing = await findDeployAgentById(db, deployAgentId);
  if (!existing) return null;

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
