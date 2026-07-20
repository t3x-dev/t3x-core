import { useCallback } from 'react';
import {
  fetchProjectPullRequestComparisons,
  fetchProjectPullRequests,
  openProjectPullRequest,
} from '@/queries/projectPullRequests';

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

  const fetchCompareCandidates = useCallback((projectId: string, base = 'main') => {
    return fetchProjectPullRequestComparisons(projectId, { base });
  }, []);

  return { createPullRequest, fetchCompareCandidates, fetchPullRequests };
}
