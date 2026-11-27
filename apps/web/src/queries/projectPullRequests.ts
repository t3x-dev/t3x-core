import type { MergeDecision } from '@t3x-dev/core';
import { saveMergeDraft } from '@/infrastructure/mergeApi';
import {
  type CreateProjectPullRequestInput,
  closeProjectPullRequest,
  createProjectPullRequest,
  getProjectPullRequest,
  getProjectPullRequestMergeReview,
  listProjectPullRequestComparisons,
  listProjectPullRequests,
  type MergeProjectPullRequestInput,
  mergeProjectPullRequest,
  type ProjectPullRequestListOptions,
  rerunProjectPullRequestReadiness,
} from '@/infrastructure/pullRequests';

export type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
  ApiPullRequestMergeReview,
  ProjectPullRequestListOptions,
} from '@/infrastructure/pullRequests';

export function fetchProjectPullRequests(
  projectId: string,
  options: ProjectPullRequestListOptions = {}
) {
  return listProjectPullRequests(projectId, options);
}

export function openProjectPullRequest(projectId: string, input: CreateProjectPullRequestInput) {
  return createProjectPullRequest(projectId, input);
}

export function fetchProjectPullRequest(projectId: string, number: number) {
  return getProjectPullRequest(projectId, number);
}

export function completeProjectPullRequest(
  projectId: string,
  number: number,
  input: MergeProjectPullRequestInput
) {
  return mergeProjectPullRequest(projectId, number, input);
}

export function dismissProjectPullRequest(projectId: string, number: number) {
  return closeProjectPullRequest(projectId, number);
}

export function rerunPullRequestReadiness(projectId: string, number: number) {
  return rerunProjectPullRequestReadiness(projectId, number);
}

export function fetchProjectPullRequestComparisons(
  projectId: string,
  options: { base?: string } = {}
) {
  return listProjectPullRequestComparisons(projectId, options);
}

export function fetchProjectPullRequestMergeReview(projectId: string, number: number) {
  return getProjectPullRequestMergeReview(projectId, number);
}

/** Persist the decision on the merge draft; returns the draft's next decision revision. */
export async function savePullRequestMergeDecision(
  draftId: string,
  decisions: MergeDecision,
  expectedRevision: number
): Promise<number> {
  const draft = await saveMergeDraft(draftId, {
    decisions,
    expected_decision_revision: expectedRevision,
  });
  return draft.decisionRevision;
}
