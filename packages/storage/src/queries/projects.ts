/**
 * Projects Queries
 *
 * CRUD operations for projects using Drizzle ORM.
 */

import { generateProjectId } from '@t3x/core';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  agentDrafts,
  branches,
  commitsV3,
  conversations,
  type NewProject,
  type Project,
  projects,
  turns,
} from '../schema';
import { commitsV4 } from '../schema-v4';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsOptions {
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
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

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [];

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
  return db.select().from(projects).orderBy(desc(projects.createdAt)).limit(limit).offset(offset);
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
  updates: { name?: string; metadata?: Record<string, unknown>; providerConfig?: string | null }
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

  const [updated] = await db
    .update(projects)
    .set(updateData)
    .where(eq(projects.projectId, projectId))
    .returning();

  return updated ?? null;
}

/**
 * Delete a project
 */
export async function deleteProject(db: AnyDB, projectId: string): Promise<boolean> {
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

  const [commitV3Count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commitsV3)
    .where(eq(commitsV3.projectId, projectId));

  const [commitV4Count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commitsV4)
    .where(eq(commitsV4.projectId, projectId));

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
      commitsCount: Number(commitV3Count?.count ?? 0) + Number(commitV4Count?.count ?? 0),
      branchesCount: Number(branchCount?.count ?? 0),
      draftsCount: Number(draftCount?.count ?? 0),
    },
  };
}
