/**
 * Projects Queries
 *
 * CRUD operations for projects using Drizzle ORM.
 */

import { eq, desc } from 'drizzle-orm';
import { projects, type Project, type NewProject } from '../schema';
import { generateProjectId, isoNow } from '@t3x/core';
import type { AnyDB } from '../adapters';

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsOptions {
  limit?: number;
  offset?: number;
}

/**
 * Insert a new project
 */
export async function insertProject(
  db: AnyDB,
  input: CreateProjectInput
): Promise<Project> {
  const projectId = generateProjectId();
  const createdAt = new Date();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const [project] = await db.insert(projects).values({
    projectId,
    name: input.name,
    createdAt,
    metadataJson,
  }).returning();

  return project;
}

/**
 * Find project by ID
 */
export async function findProjectById(
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
  options: ListProjectsOptions = {}
): Promise<Project[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update a project
 */
export async function updateProject(
  db: AnyDB,
  projectId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
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
export async function deleteProject(
  db: AnyDB,
  projectId: string
): Promise<boolean> {
  const result = await db
    .delete(projects)
    .where(eq(projects.projectId, projectId))
    .returning();

  return result.length > 0;
}
