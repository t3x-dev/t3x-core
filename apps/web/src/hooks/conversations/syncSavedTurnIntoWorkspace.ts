/**
 * After a chat turn is persisted server-side, push it into
 * `workspaceStore.turns` so subsequent extractions see the latest
 * turns immediately. Without this hop, `useExtraction` would read a
 * stale snapshot loaded at conversation mount and the
 * `/v1/extract-yops` handler would short-circuit on empty turns.
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
  turn: { turn_hash: string; content: string }
): void {
  const ws = useWorkspaceStore.getState();
  if (ws.conversationId !== conversationId) return;
  if (ws.turns.some((t) => t.turn_hash === turn.turn_hash)) return;
  ws.setTurns([...ws.turns, turn]);
}
