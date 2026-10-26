import type {
  PublishWorkspaceAuthoringInput,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringView,
} from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activityOperation,
  type ComposeActivitySelection,
  expandComposeActivityCards,
  groupComposeActivity,
} from '@/domain/composeActivity';
import { composeCardsAtPath } from '@/domain/workspaces/composeDraftChanges';
import { composeObjectChangeCards } from '@/domain/workspaces/composeObjectChanges';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import { saveProjectWorkspace } from '@/infrastructure/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

/** Compose-owned adapter over the immutable Draft authoring command and projection APIs. */
export function useComposeActivity(candidate: WorkspaceCandidate, enabledOverride = false) {
  const enabled = Boolean(candidate.authoringLedger) || enabledOverride;
  const [view, setView] = useState<WorkspaceAuthoringView | null>(null);
  const [actions, setActions] = useState<WorkspaceAuthoringAction[]>([]);
  const [cards, setCards] = useState<Record<string, WorkspaceAuthoringCard[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [retry, setRetry] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [cursor, setCursor] = useState<number | null>(null);
  const [node, setNode] = useState<WorkspaceAuthoringView['node']>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [nodeCursor, setNodeCursor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newActivity, setNewActivity] = useState<WorkspaceAuthoringView | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const reconciliationRequest = useRef<{ facts: string; id: string } | null>(null);
  const nodeRequestRef = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    setPageCount(1);
  }, [candidate.id]);
  const load = useCallback(async () => {
    if (!enabled) return;
    const api = getSharedApiClient().workspaces.authoring;
    const first = await api.read(candidate.projectId, candidate.id);
    const all = [...first.actions];
    let before = first.nextBeforeSequence;
    for (let page = 1; page < pageCount && before !== null; page++) {
      const older = await api.read(candidate.projectId, candidate.id, {
        before_sequence: before,
      });
      if (older.workspaceRevision !== first.workspaceRevision)
        throw new Error('Draft changed. Refresh activity to load a consistent history.');
      all.push(...older.actions);
      before = older.nextBeforeSequence;
    }
    const details: Record<string, WorkspaceAuthoringCard[]> = {};
    if (first.selected)
      details[first.selected.action.actionId] = composeObjectChangeCards(
        first.selected.cards,
        first.selected.before,
        first.selected.after
      );
    const missing = all.filter((a) => !details[a.actionId]);
    for (let i = 0; i < missing.length; i += 4) {
      await Promise.all(
        missing.slice(i, i + 4).map(async (action) => {
          const result = await api.read(candidate.projectId, candidate.id, {
            action_id: action.actionId,
          });
          if (result.selected?.action.actionId !== action.actionId)
            throw new Error('Event details are unavailable. Refresh activity to retry.');
          if (result.workspaceRevision !== first.workspaceRevision)
            throw new Error('Draft changed. Refresh activity to load a consistent history.');
          details[action.actionId] = composeObjectChangeCards(
            result.selected.cards,
            result.selected.before,
            result.selected.after
          );
        })
      );
    }
    setView(first);
    setActions(all);
    setCards(details);
    setCursor(before);
    setNewActivity(null);
    setError(null);
    return first;
  }, [candidate.id, candidate.projectId, enabled, pageCount]);
  useEffect(() => {
    // Only a different workspace invalidates the visible projection. Clearing it
    // on every revision unmounts the assistant and loses its chat/scroll state.
    setView(null);
    setActions([]);
    setCards({});
    setError(null);
  }, [enabled, candidate.id, candidate.projectId]);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load()
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : 'Cannot load activity');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, candidate.id, candidate.revision, retry, load]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getSharedApiClient()
        .workspaces.authoring.read(candidate.projectId, candidate.id, { limit: 1 })
        .then((next) => {
          if (
            active &&
            viewRef.current &&
            (next.workspaceRevision !== viewRef.current.workspaceRevision ||
              next.synchronization?.currentRefHead !==
                viewRef.current.synchronization?.currentRefHead)
          )
            setNewActivity(next);
        })
        .catch(() => {
          // The inspected snapshot remains readable while connectivity recovers.
        });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [candidate.id, candidate.projectId, enabled]);

  const reconcile = useCallback(async () => {
    if (reconciling) return false;
    setReconciling(true);
    setReconciliationError(null);
    try {
      const api = getSharedApiClient().workspaces.authoring;
      const latest = await api.read(candidate.projectId, candidate.id);
      if (latest.synchronization?.required) {
        const input = {
          expected_workspace_revision: latest.workspaceRevision,
          expected_ref_head: latest.synchronization.currentRefHead,
        };
        const facts = JSON.stringify([candidate.id, candidate.projectId, input]);
        const request =
          reconciliationRequest.current?.facts === facts
            ? reconciliationRequest.current
            : { facts, id: crypto.randomUUID() };
        reconciliationRequest.current = request;
        await api.reconcile(candidate.projectId, candidate.id, {
          ...input,
          request_id: request.id,
        });
      }
      await load();
      reconciliationRequest.current = null;
      setNotice(
        'Workspace synced with the branch. Existing edits and earlier history are preserved.'
      );
      return true;
    } catch (cause) {
      setReconciliationError(cause instanceof Error ? cause.message : 'Could not sync Workspace');
      return false;
    } finally {
      setReconciling(false);
    }
  }, [candidate.id, candidate.projectId, load, reconciling]);

  const inspectNode = useCallback(
    async (nodeId: string, actionId?: string) => {
      if (!enabled) return null;
      const requestId = ++nodeRequestRef.current;
      setNode(null);
      setNodeLoading(true);
      setNodeError(null);
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { node_id: nodeId, action_id: actionId }
        );
        if (nodeRequestRef.current === requestId) {
          setNode(result.node);
          setNodeCursor(
            result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
          );
        }
        return result.node;
      } catch (error) {
        if (nodeRequestRef.current === requestId)
          setNodeError(error instanceof Error ? error.message : 'Cannot load node history');
        return null;
      } finally {
        if (nodeRequestRef.current === requestId) setNodeLoading(false);
      }
    },
    [candidate.id, candidate.projectId, enabled]
  );

  const selectActionNode = useCallback(
    async (
      actionId: string,
      nodeId: string,
      path?: string
    ): Promise<ComposeActivitySelection | null> => {
      if (!enabled) return null;
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { action_id: actionId, node_id: nodeId }
        );
        if (!result.selected) return null;
        const projectedCards = composeObjectChangeCards(
          result.selected.cards,
          result.selected.before,
          result.selected.after
        );
        const nodeCards = expandComposeActivityCards(projectedCards).filter(
          (item) => item.nodeId === nodeId
        );
        const card = path
          ? (projectedCards.find(
              (item) => item.path === path || item.beforePath === path || item.afterPath === path
            ) ??
            composeCardsAtPath(result.selected.cards, path).find(
              (item) => item.nodeId === nodeId
            ) ??
            nodeCards.find(
              (item) => item.path === path || item.beforePath === path || item.afterPath === path
            ) ??
            (nodeCards.length === 1 ? nodeCards[0] : undefined))
          : projectedCards.find((item) => item.nodeId === nodeId);
        if (!card) return null;
        setCards((current) => ({ ...current, [actionId]: projectedCards }));
        setNode(result.node);
        setNodeCursor(
          result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
        );
        const action = result.selected.action;
        const eventId =
          groupComposeActivity(actions).find((event) =>
            event.actions.some((entry) => entry.actionId === action.actionId)
          )?.id ?? action.actionId;
        return {
          operation: activityOperation(card, action.reason),
          meta: {
            eventId,
            actionId: action.actionId,
            actor: action.actor.id === 'human:local-user' ? 'You' : action.actor.id,
            channel: action.channel,
            timestamp: action.publishedAt,
            comparison: 'event',
          },
        };
      } catch (error) {
        setNodeError(error instanceof Error ? error.message : 'Cannot open action');
        return null;
      }
    },
    [actions, candidate.id, candidate.projectId, enabled]
  );

  const loadOlderNode = useCallback(
    async (nodeId: string, actionId?: string) => {
      if (!enabled || nodeCursor === null) return;
      setNodeLoading(true);
      setNodeError(null);
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { node_id: nodeId, action_id: actionId, before_sequence: nodeCursor }
        );
        setNode((current) =>
          current && result.node
            ? { ...current, entries: [...current.entries, ...result.node.entries] }
            : current
        );
        setNodeCursor(
          result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
        );
      } catch (error) {
        setNodeError(error instanceof Error ? error.message : 'Cannot load older node history');
      } finally {
        setNodeLoading(false);
      }
    },
    [candidate.id, candidate.projectId, enabled, nodeCursor]
  );

  const publish = useCallback(
    async (
      input: Omit<
        PublishWorkspaceAuthoringInput,
        'expected_workspace_revision' | 'expected_revision' | 'expected_ref_head'
      >
    ) => {
      if (!view) throw new Error('Draft activity is not ready');
      setNotice(null);
      const outcome = await getSharedApiClient().workspaces.authoring.publish(
        candidate.projectId,
        candidate.id,
        {
          ...input,
          expected_workspace_revision: view.workspaceRevision,
          expected_revision: view.compositionRevision,
          expected_ref_head: view.basis.refHead,
        }
      );
      await load();
      setNotice(
        outcome.kind === 'no_change'
          ? 'The current Draft already has this value. No action was added.'
          : 'Saved as a new Draft action. Earlier history is unchanged.'
      );
      return outcome;
    },
    [candidate.id, candidate.projectId, load, view]
  );

  const createAssistantConversation = useCallback(async () => {
    if (!view) throw new Error('Draft activity is not ready');
    const api = getSharedApiClient();
    const conversation = await api.sourceThreads.create({
      project_id: candidate.projectId,
      title: 'Compose assistant',
    });
    const result = await api.workspaces.get(candidate.projectId, candidate.id);
    const current = result.workspace as unknown as WorkspaceCandidate;
    if (current.revision !== view.workspaceRevision)
      throw new Error('Draft changed; refresh before creating the conversation');
    const source = {
      id: `chat:${conversation.conversation_id}`,
      type: 'chat' as const,
      title: 'Compose assistant',
      conversationId: conversation.conversation_id,
    };
    await saveProjectWorkspace(candidate.projectId, candidate.id, {
      ...current,
      sourceBundle: [
        ...(current.sourceBundle ?? []).filter((item) => item.id !== source.id),
        source,
      ],
    });
    await load();
    return conversation.conversation_id;
  }, [candidate.id, candidate.projectId, load, view]);

  const publishCandidate = useCallback(
    async (transitionId: string, requestId: string) => {
      const outcome = await getSharedApiClient().workspaces.authoring.publishCandidate(
        candidate.projectId,
        candidate.id,
        transitionId,
        { request_id: requestId }
      );
      await load();
      setNotice(
        outcome.kind === 'no_change'
          ? 'This proposal is already reflected in the current Draft.'
          : 'Verified proposal published as a new Draft action.'
      );
      return outcome;
    },
    [candidate.id, candidate.projectId, load]
  );

  return {
    enabled,
    confirmDeletion: async (actionId: string) => {
      const current = viewRef.current;
      if (!current) throw new Error('Refresh the Draft before confirming deletion.');
      await getSharedApiClient().workspaces.authoring.confirmDeletion(
        candidate.projectId,
        candidate.id,
        actionId,
        {
          expected_workspace_revision: current.workspaceRevision,
          expected_revision: current.compositionRevision,
          expected_ref_head: current.basis.refHead,
        }
      );
      await load();
      setNotice('Deletion confirmed by you. Prepare a new Review to include this authorization.');
    },
    view,
    actions,
    cards,
    error,
    loading,
    cursor,
    node,
    nodeLoading,
    nodeError,
    nodeCursor,
    notice,
    newActivity,
    reconciling,
    reconciliationError,
    reconcile,
    compositionRevision: view?.compositionRevision,
    workspaceRevision: view?.workspaceRevision,
    basis: view?.basis,
    refresh: () => setRetry((value) => value + 1),
    loadOlder: () => setPageCount((value) => value + 1),
    loadLatest: load,
    inspectNode,
    selectActionNode,
    loadOlderNode,
    publish,
    publishCandidate,
    createAssistantConversation,
  };
}
