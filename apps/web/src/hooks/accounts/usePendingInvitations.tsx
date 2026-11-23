'use client';

import type { ReceivedCollaborationInvitation } from '@t3x-dev/api-client';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useQuery } from '@/hooks/shared/useQuery';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

const InvitationInboxContext = createContext<{
  invitations: ReceivedCollaborationInvitation[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  remove: (id: string) => void;
}>({
  invitations: [],
  loading: true,
  error: null,
  refresh: () => {},
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
  const [removed, setRemoved] = useState<{ userId: string; ids: string[] }>();

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['received-invitations', userId],
    enabled,
    staleTime: 0,
    queryFn: () => {
      if (!userId) return Promise.resolve([]);
      if (inFlight.current?.userId === userId) return inFlight.current.promise;
      const promise = getSharedApiClient()
        .listReceivedCollaborationInvitations()
        .then(({ invitations }) => invitations)
        .finally(() => {
          if (inFlight.current?.promise === promise) inFlight.current = null;
        });
      inFlight.current = { userId, promise };
      return promise;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('focus', refetch);
    const poll = window.setInterval(refetch, 60_000);
    return () => {
      window.removeEventListener('focus', refetch);
      window.clearInterval(poll);
    };
  }, [enabled, refetch]);

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
      value={{ invitations, loading: isLoading && !data, error, refresh: refetch, remove }}
    >
      {children}
    </InvitationInboxContext.Provider>
  );
}

export function useInvitationInbox() {
  return useContext(InvitationInboxContext);
}
