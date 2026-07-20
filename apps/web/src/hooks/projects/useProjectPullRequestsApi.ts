import { useCallback } from 'react';
import {
  completeProjectPullRequest,
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

  const mergePullRequest = useCallback(
    (
      projectId: string,
      input: {
        expected_source_commit_id?: string;
        expected_target_commit_id?: string;
        number: number;
      }
    ) => {
      return completeProjectPullRequest(projectId, input.number, {
        expected_source_commit_id: input.expected_source_commit_id,
        expected_target_commit_id: input.expected_target_commit_id,
      });
    },
    []
  );

  return { createPullRequest, fetchCompareCandidates, fetchPullRequests, mergePullRequest };
}
