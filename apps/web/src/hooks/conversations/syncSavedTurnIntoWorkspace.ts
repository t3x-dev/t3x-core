/**
 * After a chat turn is persisted server-side, push it into
 * `workspaceStore.turns` so source traces and committed highlights see the
 * latest immutable turns immediately.
 *
 * Guards:
 *   - only writes when the workspace is currently tracking the same
 *     conversation (a stale save from a previously-active conv must
 *     not leak into another conv's workspace after navigation).
 *   - de-dupes by turn_hash so a re-entrant save (e.g. retry) is a
 *     no-op.
 *
 * Pure function over the store snapshot — kept in `hooks/conversations`
 * because it composes a store action and is consumed only by the chat
 * sub-hook; not a domain primitive.
 */

import { useWorkspaceStore } from '@/store/workspaceStore';

export function syncSavedTurnIntoWorkspace(
  conversationId: string,
  turn: {
    turn_hash: string;
    project_id?: string;
    conversation_id?: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    rings?: Record<string, unknown> | null;
  }
): void {
  const ws = useWorkspaceStore.getState();
  if (ws.conversationId !== conversationId) return;
  if (ws.turns.some((t) => t.turn_hash === turn.turn_hash)) return;
  ws.setTurns([...ws.turns, turn]);
}
