'use client';

import { composeActorLabel } from '@/domain/composePresentation';
import { useQuery } from '@/hooks/shared/useQuery';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function useActorLabel(actorIds: readonly (string | undefined)[] = []) {
  const userIds = [
    ...new Set(actorIds.flatMap((id) => (id?.startsWith('user:') ? [id.slice(5)] : []))),
  ].sort();
  const profiles = useQuery({
    queryKey: ['actor-labels', userIds],
    queryFn: async () => {
      const client = getSharedApiClient();
      const batches = Array.from({ length: Math.ceil(userIds.length / 100) }, (_, index) =>
        userIds.slice(index * 100, (index + 1) * 100)
      );
      return (
        await Promise.all(batches.map((ids) => client.resolveCollaborationUsers(ids)))
      ).flatMap(({ users }) => users);
    },
    enabled: userIds.length > 0,
    staleTime: 60_000,
  }).data;

  return (id: string) => {
    if (id === 'human:local-user') return 'You';
    const profile = profiles?.find((user) => id === `user:${user.user_id}`);
    return profile ? `@${profile.username}` : composeActorLabel(id);
  };
}
