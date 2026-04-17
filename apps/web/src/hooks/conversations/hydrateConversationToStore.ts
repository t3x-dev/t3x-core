/**
 * hydrateConversationToStore — composite action that fetches a
 * conversation snapshot via a pure query and writes the derived
 * state to workspaceStore. Shared by useChatInit / useExtraction /
 * useRealtimeSync / useDriftResolver so each consumer does not
 * duplicate the 5-line store-write boilerplate.
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
  post.setMode('idle');
}
