/**
 * hydrateConversationToStore — composite action that fetches a
 * conversation snapshot via a pure query and writes the derived
 * state to workspaceStore. Shared by useChatInit / useExtraction /
 * useRealtimeSync so each consumer does not duplicate the store-write
 * boilerplate.
 *
 * Resilience contract: if the persisted ops log fails after partial
 * progress, we still write the atomic baseline tree + sourceIndex + opsLog
 * to the store and surface a structured `replayWarning` for the UI. We do NOT
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

import { listSourceTextRevisions } from '@/infrastructure/sourceTextRevisions';
import { fetchConversationSnapshot } from '@/queries/loadConversation';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatWorkspaceError } from './formatWorkspaceError';

async function hydrateSourceTextRevisionsBestEffort(
  projectId: string,
  convId: string
): Promise<void> {
  const store = useWorkspaceStore.getState();
  store.clearSourceTextDrafts();

  try {
    const sourceTextRevisions = await listSourceTextRevisions(projectId, convId);
    const latestSourceTextRevisions = new Map(
      sourceTextRevisions
        .filter(
          (revision) =>
            revision.turn_hash &&
            revision.content.trim().length > 0 &&
            revision.base_content_hash !== 'sha256:legacy'
        )
        .map((revision) => [revision.turn_hash, revision])
    );
    for (const revision of latestSourceTextRevisions.values()) {
      store.setSourceTextDraft(revision.turn_hash, {
        revisionId: revision.revision_id,
        status: revision.status,
        baseContentHash: revision.base_content_hash,
        turnHash: revision.turn_hash,
        turnRole: revision.turn_role,
        baseContent: revision.base_content,
        content: revision.content,
        spans: revision.spans,
        updatedAt: revision.updated_at,
      });
    }
  } catch (err) {
    console.warn('[source-text-revisions] hydrate skipped', err);
  }
}

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

  const activeChat = useChatStore.getState();
  if (
    (activeChat.activeConversationId && activeChat.activeConversationId !== convId) ||
    (activeChat.activeProjectId && activeChat.activeProjectId !== projectId)
  ) {
    return;
  }

  const post = useWorkspaceStore.getState();
  useChatStore.getState().setConversationTitle(snapshot.title);
  const commitStore = useCommitStore.getState();
  commitStore.setConversationTitle(snapshot.title);
  if (snapshot.parentCommit) {
    commitStore.cacheParentCommit(snapshot.parentCommit);
  }
  post.setTurns(snapshot.turns);
  post.setDerived({
    tree: snapshot.tree,
    sourceIndex: snapshot.sourceIndex,
    opsLog: snapshot.opsLog,
    rowsById: snapshot.rowsById,
    opOrigins: snapshot.opOrigins,
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
    const branch = snapshot.committedBranch ?? snapshot.parentCommitBranch;
    if (branch) {
      commitStore.setCommitBranch(branch);
      useChatStore.getState().setActiveBranch(branch);
    }
  } else {
    post.setCommitted(false);
    if (snapshot.parentCommitHash) {
      commitStore.setInitialCommit(snapshot.parentCommitHash, {}, {});
      commitStore.setBeforeCommitHash(snapshot.parentCommitHash);
    }
    const branch = snapshot.targetBranch ?? snapshot.parentCommitBranch;
    if (branch) {
      commitStore.setCommitBranch(branch);
      useChatStore.getState().setActiveBranch(branch);
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

  await hydrateSourceTextRevisionsBestEffort(projectId, convId);
  post.setMode('idle');
}
