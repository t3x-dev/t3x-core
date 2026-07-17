import { useCallback } from 'react';
import { fetchProjectPullRequests, openProjectPullRequest } from '@/queries/projectPullRequests';

export function useProjectPullRequestsApi() {
  const fetchPullRequests = useCallback((projectId: string) => {
    return fetchProjectPullRequests(projectId, { status: 'all' });
  }, []);

  const createPullRequest = useCallback(
    (
      projectId: string,
      input: {
        description: string;
        source_branch: string;
        target_branch: string;
        title: string;
      }
    ) => {
      return openProjectPullRequest(projectId, input);
    },
    []
  );

  return { createPullRequest, fetchPullRequests };
}
