import { useQuery } from '@/hooks/shared/useQuery';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { listProjectPullRequests } from '@/infrastructure/pullRequests';
import { listProjectWorkspaces } from '@/infrastructure/workspaces';

export function useProjectCommunityActivity(projectId: string) {
  const userId = useSessionUserId();
  const pullRequests = useQuery({
    queryKey: ['community-pull-requests', userId, projectId],
    queryFn: async () =>
      (await listProjectPullRequests(projectId, { status: 'all' })).pull_requests,
    staleTime: 0,
  });
  const workspaces = useQuery({
    queryKey: ['community-workspaces', userId, projectId],
    queryFn: () => listProjectWorkspaces(projectId),
    staleTime: 0,
  });
  return { pullRequests, workspaces };
}
