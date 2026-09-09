'use client';

import { useCallback } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function useInvitationAcceptance() {
  const client = getSharedApiClient();
  const acceptInvitation = useCallback(
    (token: string) => client.acceptCollaborationInvitation({ token }),
    [client]
  );

  return { acceptInvitation };
}
