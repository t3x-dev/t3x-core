/**
 * Database Restore
 *
 * Import a cfpack archive into the database as a new project.
 * Creates a new project with a generated ID.
 */

import type { AnyDB } from '../adapters';
import { insertConversation, insertProject, insertTurn } from '../queries';
import type { CfpackData } from './backup';

/**
 * Fix 10: Represent individual import errors instead of silently swallowing them.
 */
export interface RestoreError {
  type: 'conversation' | 'turn' | 'warning';
  id: string;
  error: string;
}

export interface RestoreResult {
  project_id: string;
  conversations_imported: number;
  turns_imported: number;
  /** Non-fatal import errors collected during restore. Empty array = no errors. */
  errors: RestoreError[];
}

/**
 * Restore a cfpack archive into the database.
 *
 * Creates a new project and imports conversations and turns.
 * Name conflicts are handled by appending "_imported".
 *
 * Fix 10: Import errors are now collected in `result.errors` instead of being
 * silently swallowed. All items are still attempted (best-effort restore).
 */
export async function restoreFromCfpack(db: AnyDB, cfpack: CfpackData): Promise<RestoreResult> {
  // Create new project (generates new project ID)
  const project = await insertProject(db, {
    name: cfpack.project.name,
  });

  const newProjectId = project.projectId;

  // Import conversations — map old IDs to new ones
  let conversationsImported = 0;
  const convIdMap = new Map<string, string>();
  const errors: RestoreError[] = [];

  for (const conv of cfpack.conversations) {
    try {
      const newConv = await insertConversation(db, {
        projectId: newProjectId,
        title: conv.title ?? undefined,
      });
      convIdMap.set(conv.conversation_id, newConv.conversationId);
      conversationsImported++;
    } catch (err) {
      errors.push({
        type: 'conversation',
        id: conv.conversation_id,
        error: err instanceof Error ? err.message : String(err),
      });
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
    } catch (err) {
      errors.push({
        type: 'turn',
        id: turn.conversation_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Warn about skipped V4 data (commits, leaves, pins are exported but not yet restored)
  const skippedTypes: string[] = [];
  if ((cfpack as any).commits_v4?.length)
    skippedTypes.push(`${(cfpack as any).commits_v4.length} commits_v4`);
  if (cfpack.commits?.length) skippedTypes.push(`${cfpack.commits.length} commits`);
  if (cfpack.leaves?.length) skippedTypes.push(`${cfpack.leaves.length} leaves`);
  if (cfpack.pins?.length) skippedTypes.push(`${cfpack.pins.length} pins`);
  if (skippedTypes.length > 0) {
    errors.push({
      type: 'warning',
      id: newProjectId,
      error: `Skipped data not yet supported by restore: ${skippedTypes.join(', ')}`,
    });
  }

  return {
    project_id: newProjectId,
    conversations_imported: conversationsImported,
    turns_imported: turnsImported,
    errors,
  };
}
