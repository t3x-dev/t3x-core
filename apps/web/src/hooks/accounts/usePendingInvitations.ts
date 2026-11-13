'use client';

import { useEffect, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function usePendingInvitations(enabled: boolean): boolean {
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void getSharedApiClient()
        .listReceivedCollaborationInvitations()
        .then(
          ({ invitations }) => {
            if (active && current === request) setHasPending(invitations.length > 0);
          },
          () => {
            if (active && current === request) setHasPending(false);
          }
        );
    };
    refresh();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, [enabled]);

  return enabled && hasPending;
}
