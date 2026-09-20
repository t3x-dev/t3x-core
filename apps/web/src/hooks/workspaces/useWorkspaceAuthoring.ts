import type { PublishWorkspaceAuthoringInput, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateWorkspaceProposal } from '@/infrastructure/proposalGeneration';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import { saveProjectWorkspace } from '@/infrastructure/workspaces';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';

/** Inspection stays stable while a newer server revision is announced separately. */
export function useWorkspaceAuthoring(projectId: string, workspaceId: string) {
  const [view, setView] = useState<WorkspaceAuthoringView | null>(null);
  const [newActivity, setNewActivity] = useState<WorkspaceAuthoringView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const epoch = useRef(0);
  const api = getSharedApiClient().workspaces.authoring;
  const load = useCallback(async () => {
    const version = epoch.current;
    const next = await api.read(projectId, workspaceId);
    if (version !== epoch.current) return;
    setView(next);
    setNewActivity(null);
    setError(null);
    return next;
  }, [api, projectId, workspaceId]);
  useEffect(() => {
    let alive = true;
    epoch.current++;
    void load().catch((err) => {
      if (alive) setError(err.message);
    });
    const timer = setInterval(() => {
      void api
        .read(projectId, workspaceId, { limit: 1 })
        .then((next) => {
          if (
            alive &&
            viewRef.current &&
            next.workspaceRevision !== viewRef.current.workspaceRevision
          )
            setNewActivity(next);
          else if (alive && viewRef.current)
            setView((current) =>
              current
                ? {
                    ...current,
                    pendingCandidates: next.pendingCandidates,
                    candidateWindowTruncated: next.candidateWindowTruncated,
                  }
                : current
            );
        })
        .catch(() => {
          /* Existing inspected data stays readable offline. */
        });
    }, 5000);
    return () => {
      alive = false;
      epoch.current++;
      clearInterval(timer);
    };
  }, [api, load, projectId, workspaceId]);
  const publish = useCallback(
    async (input: PublishWorkspaceAuthoringInput) => {
      const outcome = await api.publish(projectId, workspaceId, input);
      await load();
      return outcome;
    },
    [api, projectId, workspaceId, load]
  );
  return {
    view,
    newActivity,
    error,
    load,
    publish,
    commands: {
      createConversation: () =>
        getSharedApiClient().sourceThreads.create({
          project_id: projectId,
          title: 'Workspace source thread',
        }),
      attachSource: async (source: SourceBundleItem) => {
        const result = await getSharedApiClient().workspaces.get(projectId, workspaceId);
        const current = result.workspace as unknown as WorkspaceCandidate;
        if (current.revision !== viewRef.current?.workspaceRevision)
          throw new Error('Draft changed; refresh before changing source selection');
        const sourceBundle = [
          ...(current.sourceBundle ?? []).filter((item) => item.id !== source.id),
          source,
        ];
        await saveProjectWorkspace(projectId, workspaceId, { ...current, sourceBundle });
        await load();
      },
      sourceUserTurns: async (conversationId: string) => {
        const result = await getSharedApiClient().sourceThreads.listTurns(conversationId, {
          limit: 64,
          order: 'desc',
        });
        return result;
      },
      generate: generateWorkspaceProposal,
      prepareReview: (input: Parameters<typeof api.prepareReview>[2]) =>
        api.prepareReview(projectId, workspaceId, input),
      publishCandidate: (transitionId: string, input: { request_id: string }) =>
        api.publishCandidate(projectId, workspaceId, transitionId, input),
      decide: (
        transitionId: string,
        input: Parameters<ReturnType<typeof getSharedApiClient>['decideTransition']>[2]
      ) => getSharedApiClient().decideTransition(projectId, transitionId, input),
      commit: (
        transitionId: string,
        input: Parameters<ReturnType<typeof getSharedApiClient>['commitTransition']>[2]
      ) => getSharedApiClient().commitTransition(projectId, transitionId, input),
    },
    read: (query: Parameters<typeof api.read>[2]) => api.read(projectId, workspaceId, query),
  };
}

export type { WorkspaceAssistantContext } from '@/infrastructure/workspaceAssistant';
