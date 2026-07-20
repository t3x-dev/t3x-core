import {
  type CreateProjectPullRequestInput,
  createProjectPullRequest,
  listProjectPullRequestComparisons,
  listProjectPullRequests,
  type MergeProjectPullRequestInput,
  mergeProjectPullRequest,
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

export function completeProjectPullRequest(
  projectId: string,
  number: number,
  input: MergeProjectPullRequestInput = {}
) {
  return mergeProjectPullRequest(projectId, number, input);
}

export function fetchProjectPullRequestComparisons(
  projectId: string,
  options: { base?: string } = {}
) {
  return listProjectPullRequestComparisons(projectId, options);
}
