/**
 * Projects Queries
 *
 * CRUD operations for projects using Drizzle ORM.
 */

import { generateProjectId } from '@t3x/core';
import { desc, eq, sql } from 'drizzle-orm';
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

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsOptions {
  limit?: number;
  offset?: number;
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
  options: ListProjectsOptions = {}
): Promise<Project[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db.select().from(projects).orderBy(desc(projects.createdAt)).limit(limit).offset(offset);
}

/**
 * Update a project
 */
export async function updateProject(
  db: AnyDB,
  projectId: string,
  updates: { name?: string; metadata?: Record<string, unknown>; providerConfig?: string | null }
): Promise<Project | null> {
  const existing = await findProjectById(db, projectId);
  if (!existing) return null;

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
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(eq(conversations.projectId, projectId));

  const [turnCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(turns)
    .where(eq(turns.projectId, projectId));

  const [commitCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commitsV3)
    .where(eq(commitsV3.projectId, projectId));

  const [branchCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(branches)
    .where(eq(branches.projectId, projectId));

  const [draftCount] = await db
    .select({ count: sql<number>`count(*)` })
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
