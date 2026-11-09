import type {
  PublishWorkspaceAuthoringInput,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringOutcome,
  WorkspaceAuthoringView,
  WorkspaceReconciliationPreparation,
  WorkspaceReconciliationResolution,
} from '@t3x-dev/api-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function reconciliationFailure(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const details = (cause as Error & { details?: { issues?: unknown } }).details;
  if (!Array.isArray(details?.issues)) return cause.message;
  const issues = details.issues.flatMap((issue) => {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return [];
    const value = issue as Record<string, unknown>;
    return typeof value.message === 'string'
      ? [`${typeof value.path === 'string' ? `${value.path}: ` : ''}${value.message}`]
      : [];
  });
  return issues.length ? `${cause.message} ${issues.slice(0, 3).join('; ')}` : cause.message;
}

/** Compose-owned adapter over the immutable Draft authoring command and projection APIs. */
export function useComposeActivity(candidate: WorkspaceCandidate, enabledOverride = false) {
  const enabled = Boolean(candidate.authoringLedger) || enabledOverride;
  const scopeKey = JSON.stringify([candidate.projectId, candidate.id, enabled]);
  const scope = useMemo(
    () => ({
      key: scopeKey,
      active: true,
      epoch: 0,
      read: 0,
      poll: 0,
      node: 0,
      reconciling: false,
    }),
    [scopeKey]
  );
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const captureScope = useCallback(() => {
    const epoch = scope.epoch;
    return () => scope.active && activeScope.current === scope && epoch === scope.epoch;
  }, [scope]);
  const [owner, setOwner] = useState(scope);
  const ownsState = owner === scope;
  const [view, setView] = useState<WorkspaceAuthoringView | null>(null);
  const [actions, setActions] = useState<WorkspaceAuthoringAction[]>([]);
  const [cards, setCards] = useState<Record<string, WorkspaceAuthoringCard[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [pageCount, setPageCount] = useState(1);
  const [cursor, setCursor] = useState<number | null>(null);
  const [node, setNode] = useState<WorkspaceAuthoringView['node']>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [nodeCursor, setNodeCursor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishReceipt, setPublishReceipt] = useState<{
    outcome: WorkspaceAuthoringOutcome;
    refreshed: boolean;
  } | null>(null);
  const latestPublish = useRef<{ scope: typeof scope; outcome: WorkspaceAuthoringOutcome } | null>(
    null
  );
  const [newActivity, setNewActivity] = useState<WorkspaceAuthoringView | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reconciliationPreview, setReconciliationPreview] =
    useState<WorkspaceReconciliationPreparation | null>(null);
  const [reconciliationDeciding, setReconciliationDeciding] = useState(false);
  const reconciliationRequest = useRef<{ facts: string; id: string } | null>(null);
  const reconciliationDecisionRequest = useRef<{ facts: string; id: string } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = ownsState ? view : null;
  useEffect(() => {
    scope.active = true;
    scope.reconciling = false;
    setOwner(scope);
    setPageCount(1);
    setView(null);
    setActions([]);
    setCards({});
    setError(null);
    setCursor(null);
    setNode(null);
    setNodeLoading(false);
    setNodeError(null);
    setNodeCursor(null);
    setNotice(null);
    setPublishReceipt(null);
    setNewActivity(null);
    setReconciling(false);
    setReconciliationError(null);
    setReconciliationPreview(null);
    setReconciliationDeciding(false);
    reconciliationRequest.current = null;
    reconciliationDecisionRequest.current = null;
    return () => {
      scope.active = false;
      ++scope.epoch;
    };
  }, [scope]);
  const load = useCallback(
    async (preserveInspected = false) => {
      const isActive = captureScope();
      if (!enabled || !isActive()) return;
      const token = ++scope.read;
      const isCurrent = () => isActive() && token === scope.read;
      setLoading(true);
      setError(null);
      try {
        const api = getSharedApiClient().workspaces.authoring;
        const first = await api.read(candidate.projectId, candidate.id);
        if (!isCurrent()) return;
        const receipt =
          latestPublish.current?.scope === scope ? latestPublish.current.outcome : null;
        if (
          receipt &&
          (first.workspaceRevision < receipt.workspaceRevision ||
            first.compositionRevision < receipt.compositionRevision)
        ) {
          throw new Error('The refreshed Draft is older than the confirmed save.');
        }
        const inspected = viewRef.current;
        const matchesReceipt =
          receipt &&
          first.workspaceRevision === receipt.workspaceRevision &&
          first.compositionRevision === receipt.compositionRevision;
        if (
          preserveInspected &&
          inspected &&
          !(matchesReceipt && inspected.workspaceRevision < first.workspaceRevision) &&
          (first.workspaceRevision !== inspected.workspaceRevision ||
            first.compositionRevision !== inspected.compositionRevision ||
            first.basis?.refHead !== inspected.basis?.refHead ||
            first.synchronization?.currentRefHead !== inspected.synchronization?.currentRefHead)
        ) {
          setNewActivity(first);
          return;
        }
        const all = [...first.actions];
        let before = first.nextBeforeSequence;
        for (let page = 1; page < pageCount && before !== null; page++) {
          const older = await api.read(candidate.projectId, candidate.id, {
            before_sequence: before,
          });
          if (!isCurrent()) return;
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
              if (!isCurrent()) return;
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
          if (!isCurrent()) return;
        }
        setView(first);
        setPublishReceipt((receipt) =>
          receipt && !receipt.refreshed ? { ...receipt, refreshed: true } : receipt
        );
        setActions(all);
        setCards(details);
        setCursor(before);
        setNewActivity(null);
        setError(null);
        return first;
      } catch (error) {
        if (!isCurrent()) return;
        setError(error instanceof Error ? error.message : 'Cannot load activity');
        throw error;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [candidate.id, candidate.projectId, enabled, pageCount, captureScope, scope]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load(true).catch(() => {
      /* load owns the current error state. */
    });
    return () => {
      ++scope.read;
    };
  }, [enabled, candidate.revision, load, scope]);

  useEffect(() => {
    if (!enabled) return;
    const isActive = captureScope();
    const timer = window.setInterval(() => {
      const token = ++scope.poll;
      const readVersion = scope.read;
      void getSharedApiClient()
        .workspaces.authoring.read(candidate.projectId, candidate.id, { limit: 1 })
        .then((next) => {
          if (
            isActive() &&
            token === scope.poll &&
            readVersion === scope.read &&
            viewRef.current &&
            (next.workspaceRevision !== viewRef.current.workspaceRevision ||
              next.compositionRevision !== viewRef.current.compositionRevision ||
              next.basis?.refHead !== viewRef.current.basis?.refHead ||
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
      ++scope.poll;
      window.clearInterval(timer);
    };
  }, [candidate.id, candidate.projectId, enabled, captureScope, scope]);

  const reconcile = useCallback(async () => {
    const isCurrent = captureScope();
    if (!enabled || !isCurrent() || scope.reconciling) return false;
    scope.reconciling = true;
    setReconciling(true);
    setReconciliationError(null);
    try {
      const api = getSharedApiClient().workspaces.authoring;
      const latest = await api.read(candidate.projectId, candidate.id);
      if (!isCurrent()) return false;
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
      if (!isCurrent()) return false;
      await load();
      if (!isCurrent()) return false;
      reconciliationRequest.current = null;
      setNotice(
        'Workspace synced with the branch. Existing edits and earlier history are preserved.'
      );
      return true;
    } catch (cause) {
      if (!isCurrent()) return false;
      setReconciliationError(cause instanceof Error ? cause.message : 'Could not sync Workspace');
      return false;
    } finally {
      if (isCurrent()) {
        scope.reconciling = false;
        setReconciling(false);
      }
    }
  }, [candidate.id, candidate.projectId, load, enabled, captureScope, scope]);

  const prepareReconciliation = useCallback(async () => {
    const isCurrent = captureScope();
    if (!enabled || !isCurrent() || scope.reconciling) return null;
    scope.reconciling = true;
    setReconciling(true);
    setReconciliationError(null);
    try {
      const api = getSharedApiClient().workspaces.authoring;
      const latest = await api.read(candidate.projectId, candidate.id);
      if (!isCurrent()) return null;
      if (!latest.synchronization?.required) {
        setReconciliationPreview(null);
        setNotice('Workspace already matches the latest branch head.');
        return null;
      }
      const preview = await api.prepareReconciliation(candidate.projectId, candidate.id, {
        expected_workspace_revision: latest.workspaceRevision,
        expected_ref_head: latest.synchronization.currentRefHead,
      });
      if (!isCurrent()) return null;
      setReconciliationPreview(preview);
      return preview;
    } catch (cause) {
      if (!isCurrent()) return null;
      setReconciliationError(
        reconciliationFailure(cause, 'Could not preview Workspace synchronization')
      );
      return null;
    } finally {
      if (isCurrent()) {
        scope.reconciling = false;
        setReconciling(false);
      }
    }
  }, [candidate.id, candidate.projectId, enabled, captureScope, scope]);

  const decideReconciliation = useCallback(
    async (
      action: 'adopt' | 'cancel' | 'discard' | 'resolve',
      resolutions?: WorkspaceReconciliationResolution[]
    ) => {
      const isCurrent = captureScope();
      if (!enabled || !isCurrent() || !reconciliationPreview || reconciliationDeciding)
        return false;
      setReconciliationDeciding(true);
      setReconciliationError(null);
      try {
        const facts = JSON.stringify([
          candidate.id,
          candidate.projectId,
          reconciliationPreview.workspaceRevision,
          reconciliationPreview.currentRefHead,
          reconciliationPreview.preparationDigest,
          action,
          resolutions,
        ]);
        const request =
          reconciliationDecisionRequest.current?.facts === facts
            ? reconciliationDecisionRequest.current
            : { facts, id: crypto.randomUUID() };
        reconciliationDecisionRequest.current = request;
        const outcome = await getSharedApiClient().workspaces.authoring.decideReconciliation(
          candidate.projectId,
          candidate.id,
          {
            request_id: request.id,
            expected_workspace_revision: reconciliationPreview.workspaceRevision,
            expected_ref_head: reconciliationPreview.currentRefHead,
            preparation_digest: reconciliationPreview.preparationDigest,
            action,
            ...(resolutions ? { resolutions } : {}),
          }
        );
        if (!isCurrent()) return false;
        await load();
        if (!isCurrent()) return false;
        reconciliationDecisionRequest.current = null;
        setReconciliationPreview(null);
        setNotice(
          action === 'adopt'
            ? 'Workspace synced to the latest branch while preserving your non-conflicting edits.'
            : action === 'resolve'
              ? 'Every conflict was resolved and the complete result passed Schema validation.'
              : action === 'discard'
                ? 'Workspace edits discarded. The Draft now matches the latest branch.'
                : 'Synchronization cancelled. Your Draft and its original Base are unchanged.'
        );
        return outcome.kind !== 'no_change' || action === 'cancel';
      } catch (cause) {
        if (!isCurrent()) return false;
        setReconciliationError(
          reconciliationFailure(cause, 'Could not apply synchronization decision')
        );
        return false;
      } finally {
        if (isCurrent()) setReconciliationDeciding(false);
      }
    },
    [
      candidate.id,
      candidate.projectId,
      captureScope,
      enabled,
      load,
      reconciliationDeciding,
      reconciliationPreview,
    ]
  );

  const inspectNode = useCallback(
    async (nodeId: string, actionId?: string) => {
      const isActive = captureScope();
      if (!enabled || !isActive()) return null;
      const requestId = ++scope.node;
      const isCurrent = () => isActive() && requestId === scope.node;
      setNode(null);
      setNodeLoading(true);
      setNodeError(null);
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { node_id: nodeId, action_id: actionId }
        );
        if (isCurrent()) {
          setNode(result.node);
          setNodeCursor(
            result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
          );
        }
        return isCurrent() ? result.node : null;
      } catch (error) {
        if (isCurrent())
          setNodeError(error instanceof Error ? error.message : 'Cannot load node history');
        return null;
      } finally {
        if (isCurrent()) setNodeLoading(false);
      }
    },
    [candidate.id, candidate.projectId, enabled, captureScope, scope]
  );

  const selectActionNode = useCallback(
    async (
      actionId: string,
      nodeId: string,
      path?: string
    ): Promise<ComposeActivitySelection | null> => {
      const isActive = captureScope();
      if (!enabled || !isActive()) return null;
      const token = ++scope.node;
      const isCurrent = () => isActive() && token === scope.node;
      setNode(null);
      setNodeError(null);
      setNodeLoading(true);
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { action_id: actionId, node_id: nodeId }
        );
        if (!isCurrent() || !result.selected) return null;
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
        if (isCurrent())
          setNodeError(error instanceof Error ? error.message : 'Cannot open action');
        return null;
      } finally {
        if (isCurrent()) setNodeLoading(false);
      }
    },
    [actions, candidate.id, candidate.projectId, enabled, captureScope, scope]
  );

  const loadOlderNode = useCallback(
    async (nodeId: string, actionId?: string) => {
      const isActive = captureScope();
      if (!enabled || !isActive() || nodeCursor === null) return;
      const token = ++scope.node;
      const isCurrent = () => isActive() && token === scope.node;
      setNodeLoading(true);
      setNodeError(null);
      try {
        const result = await getSharedApiClient().workspaces.authoring.read(
          candidate.projectId,
          candidate.id,
          { node_id: nodeId, action_id: actionId, before_sequence: nodeCursor }
        );
        if (!isCurrent()) return;
        setNode((current) =>
          current && result.node
            ? { ...current, entries: [...current.entries, ...result.node.entries] }
            : current
        );
        setNodeCursor(
          result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
        );
      } catch (error) {
        if (isCurrent())
          setNodeError(error instanceof Error ? error.message : 'Cannot load older node history');
      } finally {
        if (isCurrent()) setNodeLoading(false);
      }
    },
    [candidate.id, candidate.projectId, enabled, nodeCursor, captureScope, scope]
  );

  const publish = useCallback(
    async (
      input:
        | PublishWorkspaceAuthoringInput
        | Omit<
            PublishWorkspaceAuthoringInput,
            'expected_workspace_revision' | 'expected_revision' | 'expected_ref_head'
          >
    ) => {
      const isCurrent = captureScope();
      if (!view || !ownsState || !isCurrent()) throw new Error('Draft activity is not ready');
      setNotice(null);
      const outcome = await getSharedApiClient().workspaces.authoring.publish(
        candidate.projectId,
        candidate.id,
        'expected_revision' in input
          ? input
          : {
              ...input,
              expected_workspace_revision: view.workspaceRevision,
              expected_revision: view.compositionRevision,
              expected_ref_head: view.basis.refHead,
            }
      );
      if (!isCurrent()) return outcome;
      latestPublish.current = { scope, outcome };
      setPublishReceipt({ outcome, refreshed: false });
      setNotice(
        outcome.kind === 'no_change'
          ? 'The current Draft already has this value. No action was added.'
          : outcome.kind === 'reused'
            ? 'The original Draft save was confirmed.'
            : 'Saved as a new Draft action.'
      );
      void load(true).catch(() => {
        // The write is confirmed. The read owns its separate error and retry.
      });
      return outcome;
    },
    [candidate.id, candidate.projectId, load, view, ownsState, captureScope, scope]
  );

  const createAssistantConversation = useCallback(async () => {
    const isCurrent = captureScope();
    if (!view || !ownsState || !isCurrent()) throw new Error('Draft activity is not ready');
    const api = getSharedApiClient();
    const conversation = await api.sourceThreads.create({
      project_id: candidate.projectId,
      title: 'Compose assistant',
    });
    if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
    const result = await api.workspaces.get(candidate.projectId, candidate.id);
    if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
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
    if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
    await load();
    if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
    return conversation.conversation_id;
  }, [candidate.id, candidate.projectId, load, view, ownsState, captureScope]);

  const publishCandidate = useCallback(
    async (transitionId: string, requestId: string) => {
      const isCurrent = captureScope();
      if (!enabled || !isCurrent()) throw new Error('Draft activity is not ready');
      const outcome = await getSharedApiClient().workspaces.authoring.publishCandidate(
        candidate.projectId,
        candidate.id,
        transitionId,
        { request_id: requestId }
      );
      if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
      await load();
      if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
      setNotice(
        outcome.kind === 'no_change'
          ? 'This proposal is already reflected in the current Draft.'
          : 'Verified proposal published as a new Draft action.'
      );
      return outcome;
    },
    [candidate.id, candidate.projectId, load, enabled, captureScope]
  );

  return {
    enabled,
    confirmDeletion: async (actionId: string) => {
      const isCurrent = captureScope();
      const current = viewRef.current;
      if (!current || !enabled || !isCurrent())
        throw new Error('Refresh the Draft before confirming deletion.');
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
      if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
      await load();
      if (!isCurrent()) throw new Error('Workspace changed. Refresh its Draft activity.');
      setNotice('Deletion confirmed by you. Prepare a new Review to include this authorization.');
    },
    view: ownsState ? view : null,
    actions: ownsState ? actions : [],
    cards: ownsState ? cards : {},
    error: ownsState ? error : null,
    loading: ownsState ? loading : enabled,
    cursor: ownsState ? cursor : null,
    node: ownsState ? node : null,
    nodeLoading: ownsState ? nodeLoading : false,
    nodeError: ownsState ? nodeError : null,
    nodeCursor: ownsState ? nodeCursor : null,
    notice: ownsState ? notice : null,
    savedWorkspaceRevision: ownsState ? publishReceipt?.outcome.workspaceRevision : undefined,
    awaitingPublishRefresh: ownsState && publishReceipt?.refreshed === false,
    newActivity: ownsState ? newActivity : null,
    reconciling: ownsState ? reconciling : false,
    reconciliationError: ownsState ? reconciliationError : null,
    reconciliationPreview: ownsState ? reconciliationPreview : null,
    reconciliationDeciding: ownsState ? reconciliationDeciding : false,
    reconcile,
    prepareReconciliation,
    decideReconciliation,
    compositionRevision: ownsState ? view?.compositionRevision : undefined,
    workspaceRevision: ownsState ? view?.workspaceRevision : undefined,
    basis: ownsState ? view?.basis : undefined,
    refresh: () => void load().catch(() => {}),
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
