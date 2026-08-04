import {
  type CreateProjectPullRequestInput,
  closeProjectPullRequest,
  createProjectPullRequest,
  getProjectPullRequest,
  listProjectPullRequestComparisons,
  listProjectPullRequests,
  type MergeProjectPullRequestInput,
  mergeProjectPullRequest,
  rerunProjectPullRequestReadiness,
} from '@/infrastructure/pullRequests';

export type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
} from '@/infrastructure/pullRequests';

export function fetchProjectPullRequests(
  projectId: string,
  options: { query?: string; status?: 'active' | 'merged' | 'all' } = {}
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
