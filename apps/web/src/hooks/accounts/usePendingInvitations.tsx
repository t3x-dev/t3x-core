'use client';

import type { ReceivedCollaborationInvitation } from '@t3x-dev/api-client';
import { usePathname } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@/hooks/shared/useQuery';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import { markInteraction } from '@/utils/interactionTiming';

const InvitationInboxContext = createContext<{
  invitations: ReceivedCollaborationInvitation[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  refreshOnEntry: () => void;
  remove: (id: string) => void;
}>({
  invitations: [],
  loading: true,
  error: null,
  refresh: () => {},
  refreshOnEntry: () => {},
  remove: () => {},
});

export function InvitationInboxProvider({ children }: { children: ReactNode }) {
  const userId = useSessionUserId();
  const pathname = usePathname();
  const enabled =
    userId !== null &&
    pathname !== '/login' &&
    process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() !== 'true';
  const inFlight = useRef<{
    userId: string;
    promise: Promise<ReceivedCollaborationInvitation[]>;
  } | null>(null);
  const lastLoaded = useRef<{ userId: string; at: number } | undefined>(undefined);
  const [removed, setRemoved] = useState<{ userId: string; ids: string[] }>();

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['received-invitations', userId],
    enabled,
    staleTime: 0,
    queryFn: () => {
      if (!userId) return Promise.resolve([]);
      if (inFlight.current?.userId === userId) return inFlight.current.promise;
      markInteraction('invitations', 'request-start');
      const promise = getSharedApiClient()
        .listReceivedCollaborationInvitations()
        .then(({ invitations }) => {
          if (inFlight.current?.promise === promise)
            lastLoaded.current = { userId, at: Date.now() };
          return invitations;
        })
        .finally(() => {
          if (inFlight.current?.promise === promise) inFlight.current = null;
        });
      inFlight.current = { userId, promise };
      return promise;
    },
  });

  useEffect(() => {
    if (!enabled || !userId) return;
    const canRefresh = () =>
      !document.hidden && document.hasFocus() && inFlight.current?.userId !== userId;
    const refreshVisible = () => {
      if (!canRefresh()) return;
      if (!navigator.locks) {
        refetch();
        return;
      }
      void navigator.locks
        .request(`t3x:invitations:${userId}`, { ifAvailable: true }, async (lock) => {
          if (!lock || !canRefresh()) return;
          refetch();
          await inFlight.current?.promise;
        })
        .catch(() => {
          // The inbox owns request errors and can retry on the next visible tick.
        });
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const poll = window.setInterval(refreshVisible, 60_000);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.clearInterval(poll);
    };
  }, [enabled, refetch, userId]);

  const refreshOnEntry = useCallback(() => {
    if (!enabled || document.hidden || inFlight.current?.userId === userId) return;
    const loaded = lastLoaded.current;
    if (loaded?.userId !== userId || Date.now() - loaded.at >= 15_000) refetch();
  }, [enabled, refetch, userId]);

  function remove(id: string) {
    if (!userId) return;
    setRemoved((current) => ({
      userId,
      ids: [...(current?.userId === userId ? current.ids : []), id],
    }));
  }

  const hiddenIds = removed && removed.userId === userId ? removed.ids : undefined;
  const invitations =
    data?.filter((item) => !hiddenIds?.includes(item.invitation.invitation_id)) ?? [];

  return (
    <InvitationInboxContext.Provider
      value={{
        invitations,
        loading: isLoading && !data,
        error,
        refresh: refetch,
        refreshOnEntry,
        remove,
      }}
    >
      {children}
    </InvitationInboxContext.Provider>
  );
}

export function useInvitationInbox() {
  return useContext(InvitationInboxContext);
}
