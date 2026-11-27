import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteConversation,
  type UpdateConversationInput,
  updateConversation,
} from '@/commands/conversations';
import { useSessionUserId } from '@/hooks/shared/useSession';
import type { ConversationListData } from '@/infrastructure/types';
import { fetchConversation, fetchConversations } from '@/queries/conversations';

const PAGE_SIZE = 20;

export function useWorkspaceConversations(projectId: string, enabled = true) {
  const userId = useSessionUserId();
  const scope = useMemo(
    () => ({ active: false, request: 0, loading: false }),
    [projectId, userId, enabled]
  );
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [snapshot, setSnapshot] = useState<{
    scope: typeof scope;
    data: ConversationListData;
    nextOffset: number | null;
  }>();
  const [status, setStatus] = useState<{
    scope: typeof scope;
    loading: boolean;
    error: Error | null;
  }>();

  const load = useCallback(
    async (offset: number) => {
      if (!enabled || !scope.active || activeScope.current !== scope || (offset && scope.loading))
        return;
      const request = ++scope.request;
      const isCurrent = () =>
        scope.active && activeScope.current === scope && scope.request === request;
      scope.loading = true;
      setStatus({ scope, loading: true, error: null });
      try {
        const page = await fetchConversations(projectId, PAGE_SIZE, offset);
        if (!isCurrent()) return;
        setSnapshot((previous) => ({
          scope,
          nextOffset: page.conversations.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
          data:
            offset && previous?.scope === scope
              ? {
                  ...page,
                  conversations: [
                    ...previous.data.conversations,
                    ...page.conversations.filter(
                      (item) =>
                        !previous.data.conversations.some(
                          (existing) => existing.conversation_id === item.conversation_id
                        )
                    ),
                  ],
                }
              : page,
        }));
        setStatus({ scope, loading: false, error: null });
      } catch (error) {
        if (isCurrent())
          setStatus({
            scope,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      } finally {
        if (isCurrent()) scope.loading = false;
      }
    },
    [enabled, projectId, scope]
  );

  const refetch = useCallback(() => load(0), [load]);
  useEffect(() => {
    scope.active = true;
    void refetch();
    return () => {
      scope.active = false;
      ++scope.request;
    };
  }, [refetch, scope]);

  const update = useCallback(
    async (conversationId: string, input: UpdateConversationInput) => {
      await updateConversation(conversationId, input);
      await refetch();
    },
    [refetch]
  );

  const get = useCallback((conversationId: string) => fetchConversation(conversationId), []);

  const remove = useCallback(
    async (conversationId: string) => {
      await deleteConversation(conversationId);
      await refetch();
    },
    [refetch]
  );

  const current = enabled && snapshot?.scope === scope ? snapshot : undefined;
  return {
    data: current?.data ?? null,
    loading: enabled && (status?.scope === scope ? status.loading : true),
    error: status?.scope === scope ? status.error : null,
    hasMore: current?.nextOffset != null,
    loadMore: () => {
      if (current?.nextOffset != null) void load(current.nextOffset);
    },
    refetch,
    get,
    remove,
    update,
  };
}
