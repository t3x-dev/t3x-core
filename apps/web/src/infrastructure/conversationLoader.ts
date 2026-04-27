/**
 * L1 — parallel loader for turns + yops log.
 * This is the only loader the UI calls on conversation mount.
 */

import type { YOpsLogEntry } from '@t3x-dev/core';
import { getConversation } from '@/infrastructure/conversations';
import { listTurns } from '@/infrastructure/turns';
import type { Turn } from '@/infrastructure/types';
import { loadYOpsLog } from './yopsLog';

export type { Turn as LoadedTurn };

export interface LoadedConversation {
  convId: string;
  turns: Turn[];
  opsLog: YOpsLogEntry[];
  committedAs: string | null;
  committedAt: string | null;
  parentCommitHash: string | null;
}

export async function loadConversation(
  projectId: string,
  convId: string
): Promise<LoadedConversation> {
  const [conversation, turnsData, opsLog] = await Promise.all([
    getConversation(convId),
    listTurns(projectId, convId),
    loadYOpsLog(convId),
  ]);
  return {
    convId,
    turns: turnsData.turns,
    opsLog,
    committedAs: conversation.committed_as ?? null,
    committedAt: conversation.committed_at ?? null,
    parentCommitHash: conversation.parent_commit_hash ?? null,
  };
}
