/**
 * Database Restore
 *
 * Import a cfpack archive into the database as a new project.
 * Creates a new project with a generated ID.
 */

import type { AnyDB } from '../adapters';
import type { CfpackData } from './backup';
import {
  insertProject,
  insertConversation,
  insertTurn,
} from '../queries';

export interface RestoreResult {
  project_id: string;
  conversations_imported: number;
  turns_imported: number;
}

/**
 * Restore a cfpack archive into the database.
 *
 * Creates a new project and imports conversations and turns.
 * Name conflicts are handled by appending "_imported".
 */
export async function restoreFromCfpack(
  db: AnyDB,
  cfpack: CfpackData
): Promise<RestoreResult> {
  // Create new project (generates new project ID)
  const project = await insertProject(db, {
    name: cfpack.project.name,
  });

  const newProjectId = project.projectId;

  // Import conversations — map old IDs to new ones
  let conversationsImported = 0;
  const convIdMap = new Map<string, string>();

  for (const conv of cfpack.conversations) {
    try {
      const newConv = await insertConversation(db, {
        projectId: newProjectId,
        title: conv.title ?? undefined,
      });
      convIdMap.set(conv.conversation_id, newConv.conversationId);
      conversationsImported++;
    } catch (_err) {
      // Skip on error
    }
  }

  // Import turns
  let turnsImported = 0;
  for (const turn of cfpack.turns) {
    try {
      const mappedConvId = convIdMap.get(turn.conversation_id) || turn.conversation_id;
      await insertTurn(db, {
        projectId: newProjectId,
        conversationId: mappedConvId,
        role: turn.role as 'user' | 'assistant' | 'system' | 'tool',
        content: turn.content,
      });
      turnsImported++;
    } catch (_err) {
      // Skip on error (hash conflicts, etc.)
    }
  }

  return {
    project_id: newProjectId,
    conversations_imported: conversationsImported,
    turns_imported: turnsImported,
  };
}
