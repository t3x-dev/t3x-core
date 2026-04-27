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
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
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
  useChatStore.getState().setConversationTitle(snapshot.title);
  useCommitStore.getState().setConversationTitle(snapshot.title);
  post.setTurns(snapshot.turns);
  post.setDerived({
    tree: snapshot.tree,
    sourceIndex: snapshot.sourceIndex,
    opsLog: snapshot.opsLog,
    baselineCommitHash: snapshot.parentCommitHash,
    hasConversationChanges: snapshot.opsLog.length > 0 || Boolean(snapshot.committedAs),
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
  if (snapshot.committedAs) {
    post.setCommitted(true);
    post.clearDraft();
    useCommitStore.getState().setInitialCommit(snapshot.committedAs, {}, {});
  } else {
    post.setCommitted(false);
    if (snapshot.parentCommitHash) {
      const commitStore = useCommitStore.getState();
      commitStore.setInitialCommit(snapshot.parentCommitHash, {}, {});
      commitStore.setBeforeCommitHash(snapshot.parentCommitHash);
      if (snapshot.parentCommitBranch) {
        commitStore.setCommitBranch(snapshot.parentCommitBranch);
        useChatStore.getState().setActiveBranch(snapshot.parentCommitBranch);
      }
    }
    // Layer any persisted draft for this conversation on top of the
    // freshly-hydrated server state. This is the F5 protection: if the
    // user staged an Extract proposal and reloaded, the draft + script +
    // dry-run preview come back so they can keep reviewing instead of
    // losing the LLM round-trip. No-op if there's nothing persisted.
    post.restoreDraftFor(convId);
  }

  // Discoverability: a content-bearing conversation should not require
  // a click to reveal. Auto-expand on first view if the project has no
  // explicit preference yet AND the snapshot carries something worth
  // showing. The check uses `projectId in panelExpandedByProject` so an
  // explicit user-folded preference (`false`) is preserved — only the
  // truly-missing case gets the auto-expand. Re-firing this on every
  // hydrate of the same project is safe: once the key exists, the
  // condition flips and the call is skipped.
  const hydrated = useWorkspaceStore.getState();
  const hasContent =
    snapshot.opsLog.length > 0 ||
    snapshot.tree.trees.length > 0 ||
    snapshot.tree.relations.length > 0 ||
    hydrated.hasDraft;
  if (hasContent && !(projectId in hydrated.panelExpandedByProject)) {
    hydrated.setProjectPanelExpansion(projectId, true);
  }

  post.setMode('idle');
}
