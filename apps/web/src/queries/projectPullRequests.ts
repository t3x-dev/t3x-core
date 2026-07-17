import {
  type CreateProjectPullRequestInput,
  createProjectPullRequest,
  listProjectPullRequests,
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
