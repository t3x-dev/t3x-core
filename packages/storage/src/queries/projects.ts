/**
 * Projects Queries
 *
 * CRUD operations for projects using Drizzle ORM.
 */

import { generateProjectId } from '@t3x-dev/core';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  agentDrafts,
  branches,
  conversations,
  type NewProject,
  type Project,
  projects,
  turns,
} from '../schema';
import { transitionCommits } from '../schema-transition-commits';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
  /** Owner user ID. Omit or undefined → NULL (local/legacy data). */
  ownerId?: string;
  /** Namespace resource ID. Omit only for legacy or non-namespace flows. */
  namespaceId?: string;
}

export interface ListProjectsOptions {
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
  /** Filter by owner. Authenticated callers receive only projects owned by this user. */
  owner_id?: string;
  /** Filter projects by their persisted namespace resource ID. */
  namespace_id?: string;
  /** Canonical current authority; server-derived and never accepted from query JSON. */
  authority?: {
    principal_kind: 'human' | 'agent' | 'service';
    principal_id: string;
  };
}

export interface ProjectStats {
  conversationsCount: number;
  turnsCount: number;
  commitsCount: number;
  branchesCount: number;
  draftsCount: number;
}

export interface ProjectWithStats extends Project {
  stats: ProjectStats;
}

/**
 * Insert a new project
 */
export async function insertProject(db: AnyDB, input: CreateProjectInput): Promise<Project> {
  const projectId = generateProjectId();
  const createdAt = new Date();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const [project] = await db
    .insert(projects)
    .values({
      projectId,
      name: input.name,
      ownerId: input.ownerId ?? null,
      namespaceId: input.namespaceId ?? null,
      createdAt,
      metadataJson,
    })
    .returning();

  return project;
}

/**
 * Find project by ID
 */
export async function findProjectById(db: AnyDB, projectId: string): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.projectId, projectId), isNull(projects.deletedAt)))
    .limit(1);

  return project ?? null;
}

/**
 * Find project by ID, including soft-deleted projects.
 * Used by restore route for access control.
 */
export async function findProjectByIdIncludingDeleted(
  db: AnyDB,
  projectId: string
): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);

  return project ?? null;
}

/**
 * Find all projects
 */
export async function findProjects(
  db: AnyDB,
  options: ListProjectsOptions & { cursor: string }
): Promise<CursorPage<Project>>;
export async function findProjects(
  db: AnyDB,
  options?: Omit<ListProjectsOptions, 'cursor'>
): Promise<Project[]>;
export async function findProjects(
  db: AnyDB,
  options: ListProjectsOptions = {}
): Promise<Project[] | CursorPage<Project>> {
  const limit = options.limit ?? 100;

  // Owner filter: authenticated callers see only their own projects. Unowned
  // rows are legacy local data and must be claimed explicitly before auth use.
  const ownerCondition = options.owner_id ? eq(projects.ownerId, options.owner_id) : undefined;
  const namespaceCondition = options.namespace_id
    ? eq(projects.namespaceId, options.namespace_id)
    : undefined;
  const authorityCondition = options.authority
    ? sql<boolean>`(
        EXISTS (
          SELECT 1
          FROM namespace_memberships AS membership
          WHERE membership.namespace_id = ${projects.namespaceId}
            AND membership.principal_kind = ${options.authority.principal_kind}
            AND membership.principal_id = ${options.authority.principal_id}
            AND membership.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM project_grants AS project_grant
          WHERE project_grant.project_id = ${projects.projectId}
            AND project_grant.namespace_id = ${projects.namespaceId}
            AND project_grant.principal_kind = ${options.authority.principal_kind}
            AND project_grant.principal_id = ${options.authority.principal_id}
            AND project_grant.status = 'active'
        )
      )`
    : undefined;

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [isNull(projects.deletedAt)];

    if (ownerCondition) conditions.push(ownerCondition);
    if (namespaceCondition) conditions.push(namespaceCondition);
    if (authorityCondition) conditions.push(authorityCondition);

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      const cursorDate = new Date(t);
      // Keyset: (created_at < t) OR (created_at = t AND project_id < k)
      conditions.push(
        or(
          lt(projects.createdAt, cursorDate),
          and(eq(projects.createdAt, cursorDate), lt(projects.projectId, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(projects)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(projects.createdAt), desc(projects.projectId))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (p) => ({
      t: p.createdAt.toISOString(),
      k: p.projectId,
    }));
  }

  // Legacy offset/limit mode
  const offset = options.offset ?? 0;
  const conditions = [isNull(projects.deletedAt)];
  if (ownerCondition) conditions.push(ownerCondition);
  if (namespaceCondition) conditions.push(namespaceCondition);
  if (authorityCondition) conditions.push(authorityCondition);

  return db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);
}

/** List active legacy projects that have not yet been assigned to a human owner. */
export async function findUnownedProjects(db: AnyDB, limit = 100): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(and(isNull(projects.ownerId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt))
    .limit(limit);
}

/**
 * Atomically claim selected active legacy projects for one authenticated human.
 * The owner_id IS NULL predicate prevents reassignment races or operator takeover.
 */
export async function claimUnownedProjects(
  db: AnyDB,
  ownerId: string,
  namespaceId: string,
  projectIds: string[]
): Promise<Project[]> {
  if (projectIds.length === 0) return [];
  return db
    .update(projects)
    .set({ ownerId, namespaceId })
    .where(
      and(
        inArray(projects.projectId, projectIds),
        isNull(projects.ownerId),
        isNull(projects.deletedAt)
      )
    )
    .returning();
}

/**
 * Update a project
 *
 * Fix 8: Removed the preliminary read (TOCTOU). The UPDATE itself returns the
 * updated row; if 0 rows are returned the project does not exist.
 */
export async function updateProject(
  db: AnyDB,
  projectId: string,
  updates: {
    name?: string;
    metadata?: Record<string, unknown>;
    providerConfig?: string | null;
    defaultProvider?: string | null;
    defaultModel?: string | null;
    extractionStyle?: {
      granularity: 'concise' | 'balanced' | 'detailed';
      quote_length: 'minimal' | 'contextual';
      update_stance: 'conservative' | 'balanced' | 'aggressive';
      tier3: 'skip' | 'extract';
    } | null;
  }
): Promise<Project | null> {
  const updateData: Partial<NewProject> = {};
  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.metadata !== undefined) {
    updateData.metadataJson = JSON.stringify(updates.metadata);
  }
  if (updates.providerConfig !== undefined) {
    updateData.providerConfig = updates.providerConfig;
  }
  if (updates.defaultProvider !== undefined) {
    updateData.defaultProvider = updates.defaultProvider;
  }
  if (updates.defaultModel !== undefined) {
    updateData.defaultModel = updates.defaultModel;
  }
  if (updates.extractionStyle !== undefined) {
    updateData.extractionStyle = updates.extractionStyle;
  }

  const [updated] = await db
    .update(projects)
    .set(updateData)
    .where(and(eq(projects.projectId, projectId), isNull(projects.deletedAt)))
    .returning();

  return updated ?? null;
}

/**
 * Delete a project
 */
export async function deleteProject(db: AnyDB, projectId: string): Promise<boolean> {
  const result = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.projectId, projectId), isNull(projects.deletedAt)))
    .returning();

  return result.length > 0;
}

/**
 * Restore a soft-deleted project
 */
export async function restoreProject(db: AnyDB, projectId: string): Promise<Project | null> {
  const [restored] = await db
    .update(projects)
    .set({ deletedAt: null })
    .where(and(eq(projects.projectId, projectId), sql`${projects.deletedAt} IS NOT NULL`))
    .returning();

  return restored ?? null;
}

/**
 * Permanently delete a project and all project-scoped data through cascades,
 * including the trusted Decision audit ledger. Normal soft deletion preserves
 * that audit history and remains restorable.
 */
export async function permanentDeleteProject(db: AnyDB, projectId: string): Promise<boolean> {
  const result = await db.delete(projects).where(eq(projects.projectId, projectId)).returning();

  return result.length > 0;
}

/**
 * Find project with stats (counts of related entities)
 */
export async function findProjectWithStats(
  db: AnyDB,
  projectId: string
): Promise<ProjectWithStats | null> {
  const project = await findProjectById(db, projectId);
  if (!project) return null;

  // Get counts for all related entities
  const [convCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(eq(conversations.projectId, projectId));

  const [turnCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(turns)
    .where(eq(turns.projectId, projectId));

  const [commitCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transitionCommits)
    .where(eq(transitionCommits.projectId, projectId));

  const [branchCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(branches)
    .where(eq(branches.projectId, projectId));

  const [draftCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentDrafts)
    .where(eq(agentDrafts.projectId, projectId));

  return {
    ...project,
    stats: {
      conversationsCount: Number(convCount?.count ?? 0),
      turnsCount: Number(turnCount?.count ?? 0),
      commitsCount: Number(commitCount?.count ?? 0),
      branchesCount: Number(branchCount?.count ?? 0),
      draftsCount: Number(draftCount?.count ?? 0),
    },
  };
}
