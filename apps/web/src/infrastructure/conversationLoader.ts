/**
 * L1 — parallel loader for turns + yops log.
 * This is the only loader the UI calls on conversation mount.
 */

import type { YOpsLogEntry } from '@t3x-dev/core';
import type { Turn } from '@/infrastructure/types';
import { listTurns } from '@/infrastructure/turns';
import { loadYOpsLog } from './yopsLog';

export type { Turn as LoadedTurn };

export interface LoadedConversation {
  convId: string;
  turns: Turn[];
  opsLog: YOpsLogEntry[];
}

export async function loadConversation(
  projectId: string,
  convId: string,
): Promise<LoadedConversation> {
  const [turnsData, opsLog] = await Promise.all([
    listTurns(projectId, convId),
    loadYOpsLog(convId),
  ]);
  return { convId, turns: turnsData.turns, opsLog };
}
