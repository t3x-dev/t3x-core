import type { MergeDecision } from '@t3x-dev/core';
import { useCallback } from 'react';
import {
  completeProjectPullRequest,
  dismissProjectPullRequest,
  fetchProjectPullRequest,
  fetchProjectPullRequestComparisons,
  fetchProjectPullRequests,
  openProjectPullRequest,
  rerunPullRequestReadiness,
} from '@/queries/projectPullRequests';

export type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
} from '@/queries/projectPullRequests';

export function useProjectPullRequestsApi() {
  const fetchPullRequests = useCallback((projectId: string) => {
    return fetchProjectPullRequests(projectId, { status: 'all' });
  }, []);

  const fetchPullRequest = useCallback((projectId: string, number: number) => {
    return fetchProjectPullRequest(projectId, number);
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
        expected_source_commit_id: string;
        expected_target_commit_id: string;
        number: number;
        decisions?: MergeDecision;
        message?: string;
      }
    ) => {
      return completeProjectPullRequest(projectId, input.number, {
        expected_source_commit_id: input.expected_source_commit_id,
        expected_target_commit_id: input.expected_target_commit_id,
        decisions: input.decisions,
        message: input.message,
      });
    },
    []
  );

  const closePullRequest = useCallback((projectId: string, input: { number: number }) => {
    return dismissProjectPullRequest(projectId, input.number);
  }, []);

  const rerunReadiness = useCallback((projectId: string, input: { number: number }) => {
    return rerunPullRequestReadiness(projectId, input.number);
  }, []);

  return {
    closePullRequest,
    createPullRequest,
    fetchCompareCandidates,
    fetchPullRequest,
    fetchPullRequests,
    mergePullRequest,
    rerunReadiness,
  };
}
