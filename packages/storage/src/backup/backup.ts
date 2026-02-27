/**
 * Database Backup
 *
 * Export project data as a cfpack-compatible JSON structure.
 * Reuses existing query functions to extract all project data.
 */

import type { AnyDB } from '../adapters';
import {
  findCommitsV4ByProject,
  findConversationsByProject,
  findLeavesByProject,
  findPinsByProject,
  findProjectById,
  findTurnsByProject,
  listCommitsV3,
} from '../queries';

export interface CfpackData {
  version: string;
  project: {
    project_id: string;
    name: string;
    created_at: string;
  };
  conversations: Array<{
    conversation_id: string;
    project_id: string;
    title: string | null;
    created_at: string;
  }>;
  turns: Array<{
    turn_hash: string;
    parent_turn_hash: string | null;
    conversation_id: string;
    role: string;
    content: string;
    rings_json: string | null;
    created_at: string;
  }>;
  commits_v3: Array<Record<string, unknown>>;
  commits_v4: Array<Record<string, unknown>>;
  leaves: Array<Record<string, unknown>>;
  pins: Array<Record<string, unknown>>;
  meta: {
    exported_at: string;
    exported_by: string;
    format_version: string;
  };
}

/**
 * Export all data for a single project as a cfpack structure.
 */
export async function backupAsCfpack(db: AnyDB, projectId: string): Promise<CfpackData> {
  const project = await findProjectById(db, projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const conversations = await findConversationsByProject(db, { projectId, limit: 100000 });
  const turnRows = await findTurnsByProject(db, { projectId, limit: 100000 });
  const commitsV3 = await listCommitsV3(db, { projectId, limit: 100000 });
  const commitsV4 = await findCommitsV4ByProject(db, projectId, { limit: 100000 });
  const leaves = await findLeavesByProject(db, projectId, { limit: 100000 });
  const pins = await findPinsByProject(db, projectId, { limit: 100000 });

  return {
    version: '2.0.0',
    project: {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
    },
    conversations: conversations.map((c) => ({
      conversation_id: c.conversationId,
      project_id: c.projectId,
      title: c.title,
      created_at: c.createdAt.toISOString(),
    })),
    turns: turnRows.map((t) => ({
      turn_hash: t.turnHash,
      parent_turn_hash: t.parentTurnHash,
      conversation_id: t.conversationId,
      role: t.role,
      content: t.content,
      rings_json: t.ringsJson ?? null,
      created_at: t.createdAt.toISOString(),
    })),
    commits_v3: commitsV3 as unknown as Array<Record<string, unknown>>,
    commits_v4: commitsV4 as unknown as Array<Record<string, unknown>>,
    leaves: leaves as unknown as Array<Record<string, unknown>>,
    pins: pins as unknown as Array<Record<string, unknown>>,
    meta: {
      exported_at: new Date().toISOString(),
      exported_by: 't3x-storage-backup',
      format_version: '2.0.0',
    },
  };
}

/**
 * Export all projects as cfpack structures.
 */
export async function backupAllProjects(db: AnyDB): Promise<CfpackData[]> {
  const { findProjects } = await import('../queries');
  const projects = await findProjects(db, { limit: 10000 });
  const results: CfpackData[] = [];

  for (const project of projects) {
    const cfpack = await backupAsCfpack(db, project.projectId);
    results.push(cfpack);
  }

  return results;
}
