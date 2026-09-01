/**
 * L1 — parallel loader for turns + yops log.
 * This is the only loader the UI calls on conversation mount.
 */

import type { YOpsLogEntry } from '@t3x-dev/core';
import { getConversation } from '@/infrastructure/conversations';
import { getLegacyYOpsEvidence } from '@/infrastructure/sourceEvidence';
import { listTurns } from '@/infrastructure/turns';
import type { Turn } from '@/infrastructure/types';

export type { Turn as LoadedTurn };

export interface LoadedConversation {
  convId: string;
  title: string | null;
  turns: Turn[];
  opsLog: YOpsLogEntry[];
  committedAs: string | null;
  committedAt: string | null;
  parentCommitHash: string | null;
  metadata: Record<string, unknown> | null;
}

export async function loadConversation(
  projectId: string,
  convId: string
): Promise<LoadedConversation> {
  const [conversation, turnsData, evidence] = await Promise.all([
    getConversation(convId),
    listTurns(projectId, convId),
    getLegacyYOpsEvidence(projectId, convId, { order: 'asc', limit: 200 }),
  ]);
  const opsLog: YOpsLogEntry[] = evidence.items.flatMap((item) => {
    if (item.lifecycle.superseded_at !== null) return [];
    return [
      {
        id: item.id,
        conversation_id: item.conversation_id,
        project_id: item.project_id,
        source: item.source as YOpsLogEntry['source'],
        turn_hash: item.turn_hash ?? undefined,
        yops: item.yops,
        created_at: item.created_at,
        metadata: item.metadata as Record<string, unknown> | null,
        superseded_at: null,
        is_committed: item.lifecycle.status === 'committed',
        committed_by: item.lifecycle.committed_by,
      },
    ];
  });
  return {
    convId,
    title: conversation.title ?? null,
    turns: turnsData.turns,
    opsLog,
    committedAs: conversation.committed_as ?? null,
    committedAt: conversation.committed_at ?? null,
    parentCommitHash: conversation.parent_commit_hash ?? null,
    metadata: conversation.metadata ?? null,
  };
}
