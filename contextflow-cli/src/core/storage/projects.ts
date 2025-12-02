/**
 * Projects CRUD operations
 */

import { getDb } from '../db';
import type {
  ProjectRecord,
  ProjectWithStats,
  CreateProjectInput,
  ListProjectsOptions,
} from './types';
import { generateProjectId, isoNow } from './utils';

export function createProject(input: CreateProjectInput): ProjectRecord {
  const db = getDb();
  const project_id = generateProjectId();
  const created_at = isoNow();
  const metadata_json = input.metadata ? JSON.stringify(input.metadata) : null;

  db.prepare(
    `INSERT INTO projects (project_id, name, created_at, metadata_json)
     VALUES (?, ?, ?, ?)`
  ).run(project_id, input.name, created_at, metadata_json);

  return {
    project_id,
    name: input.name,
    created_at,
    metadata_json,
  };
}

export function getProject(project_id: string): ProjectRecord | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM projects WHERE project_id = ?`)
    .get(project_id) as ProjectRecord | undefined;
  return row ?? null;
}

export function getProjectWithStats(project_id: string): ProjectWithStats | null {
  const db = getDb();
  const project = getProject(project_id);
  if (!project) return null;

  const stats = {
    conversations_count: (
      db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE project_id = ?`).get(project_id) as { c: number }
    ).c,
    turns_count: (
      db.prepare(`SELECT COUNT(*) as c FROM turns_v2 WHERE project_id = ?`).get(project_id) as { c: number }
    ).c,
    commits_count: (
      db.prepare(`SELECT COUNT(*) as c FROM commits_v2 WHERE project_id = ?`).get(project_id) as { c: number }
    ).c,
    branches_count: (
      db.prepare(`SELECT COUNT(*) as c FROM branches WHERE project_id = ?`).get(project_id) as { c: number }
    ).c,
    drafts_count: (
      db.prepare(`SELECT COUNT(*) as c FROM drafts_v2 WHERE project_id = ?`).get(project_id) as { c: number }
    ).c,
  };

  return { ...project, stats };
}

export function listProjects(options: ListProjectsOptions = {}): ProjectRecord[] {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .prepare(`SELECT * FROM projects ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as ProjectRecord[];
}

export function deleteProject(project_id: string): boolean {
  const db = getDb();

  // CASCADE will handle related tables
  const result = db
    .prepare(`DELETE FROM projects WHERE project_id = ?`)
    .run(project_id);

  return result.changes > 0;
}

export function updateProject(
  project_id: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): ProjectRecord | null {
  const db = getDb();
  const existing = getProject(project_id);
  if (!existing) return null;

  const name = updates.name ?? existing.name;
  const metadata_json = updates.metadata
    ? JSON.stringify(updates.metadata)
    : existing.metadata_json;

  db.prepare(
    `UPDATE projects SET name = ?, metadata_json = ? WHERE project_id = ?`
  ).run(name, metadata_json, project_id);

  return getProject(project_id);
}
