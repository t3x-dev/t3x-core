import { useEffect, useState } from 'react';
import { type ApiProjectPullRequest, listProjectPullRequests } from '@/infrastructure/pullRequests';
import { listProjectWorkspaces } from '@/infrastructure/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
export function useProjectCommunityActivity(projectId: string) {
  const [pullRequests, setPullRequests] = useState<ApiProjectPullRequest[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceCandidate[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    Promise.allSettled([
      listProjectPullRequests(projectId, { status: 'all' }),
      listProjectWorkspaces(projectId),
    ])
      .then(([prs, drafts]) => {
        if (cancelled) return;
        setPullRequests(prs.status === 'fulfilled' ? prs.value.pull_requests : []);
        setWorkspaces(drafts.status === 'fulfilled' ? drafts.value : []);
        if (prs.status === 'rejected' || drafts.status === 'rejected')
          setActivityError('Some project objects could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { pullRequests, workspaces, activityError, activityLoading };
}
