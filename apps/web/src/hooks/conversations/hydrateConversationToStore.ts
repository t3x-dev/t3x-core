/**
 * hydrateConversationToStore — composite action that fetches a
 * conversation snapshot via a pure query and writes the derived
 * state to workspaceStore. Shared by useChatInit / useExtraction /
 * useRealtimeSync so each consumer does not duplicate the store-write
 * boilerplate.
 *
 * Resilience contract: if the persisted ops log replays partially,
 * we still write the partial tree + sourceIndex + opsLog to the store
 * and surface a structured `replayWarning` for the UI. We do NOT
 * throw — a single bad legacy op should not brick the workspace. The
 * mode lands as 'idle' and lastError stays null. The banner reads
 * `replayWarning` and offers a "Delete this op" action that calls
 * `removeYOpsEntry` and re-hydrates.
 *
 * Hard errors (network, persistence) still throw — those are real
 * failures the caller needs to handle (useChatInit falls back to
 * inheritance, useExtraction surfaces a toast).
 *
 * Lives in hooks/ but is not itself a hook (no React state). Per v2
 * hooks/ may import queries/ + store/ + infrastructure/ — fine.
 */

import { fetchConversationSnapshot } from '@/queries/loadConversation';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatWorkspaceError } from './formatWorkspaceError';

export async function hydrateConversationToStore(projectId: string, convId: string): Promise<void> {
  const pre = useWorkspaceStore.getState();
  pre.setConversation(convId);
  pre.setError(null);
  pre.setReplayWarning(null);

  let snapshot;
  try {
    snapshot = await fetchConversationSnapshot(projectId, convId);
  } catch (err) {
    const msg = formatWorkspaceError(err);
    pre.setMode('error');
    pre.setError(msg);
    throw err;
  }

  const post = useWorkspaceStore.getState();
  post.setTurns(snapshot.turns);
  post.setDerived({
    tree: snapshot.tree,
    sourceIndex: snapshot.sourceIndex,
    opsLog: snapshot.opsLog,
  });
  if (snapshot.partial) {
    post.setReplayWarning({
      opIndex: snapshot.partial.opIndex,
      code: snapshot.partial.code,
      message: snapshot.partial.message,
      rowId: snapshot.partial.rowId,
      opIndexInRow: snapshot.partial.opIndexInRow,
      appliedCount: snapshot.partial.appliedCount,
    });
  }
  post.setMode('idle');
}
