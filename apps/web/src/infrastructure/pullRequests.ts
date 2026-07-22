import type { MergeDecision } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type ProjectPullRequestStatus =
  | 'draft'
  | 'open'
  | 'checking'
  | 'ready'
  | 'blocked'
  | 'merged'
  | 'closed';

export interface ApiProjectPullRequest {
  id: string;
  number: number;
  project_id: string;
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  source_commit_id: string;
  target_base_commit_id: string;
  merge_draft_id: string | null;
  merge_commit_id: string | null;
  status: ProjectPullRequestStatus;
  author_id: string;
  steward_id: string | null;
  review_owner_id: string | null;
  workspace_id: string | null;
  release_lane_id: string | null;
  linked_work: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface ApiProjectPullRequestCheck {
  id: string;
  pull_request_id: string;
  kind:
    | 'source_commit'
    | 'target_commit'
    | 'base_freshness'
    | 'schema_compatibility'
    | 'merge_simulation'
    | 'conflict_resolution'
    | 'output_impact'
    | 'review_requirement'
    | 'permission';
  status: 'pending' | 'running' | 'passed' | 'warning' | 'blocked' | 'failed';
  title: string;
  message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ApiProjectPullRequestActivity {
  id: string;
  pull_request_id: string;
  actor_id: string;
  type:
    | 'created'
    | 'description_updated'
    | 'status_changed'
    | 'checks_reran'
    | 'commented'
    | 'base_updated'
    | 'merged'
    | 'closed';
  message: string;
  created_at: string;
}

export interface ApiProjectPullRequestDetail extends ApiProjectPullRequest {
  diff_summary: {
    changed_nodes: number;
    yops_operations: number;
    output_impacts: number;
    source_refs: number;
  };
  checks: ApiProjectPullRequestCheck[];
  activity: ApiProjectPullRequestActivity[];
}

export interface ProjectPullRequestListData {
  pull_requests: ApiProjectPullRequest[];
  counts: {
    active: number;
    merged: number;
  };
}

export interface ApiProjectPullRequestCompareCandidate {
  id: string;
  branch: string;
  base_branch: string;
  title: string;
  description: string;
  head_commit_id: string;
  base_commit_id: string | null;
  updated_at: string;
  ahead_by: number;
  behind_by: number;
  yops_changes: number;
  changed_nodes: number;
  output_impacts: number;
  source_refs: number;
  schema: string;
  status: 'ready' | 'already_open' | 'no_changes' | 'base_empty';
  status_label: string;
  open_pull_request_number: number | null;
}

export interface ProjectPullRequestCompareData {
  base_branches: string[];
  compare_branches: ApiProjectPullRequestCompareCandidate[];
}

export interface CreateProjectPullRequestInput {
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  expected_source_commit_id: string;
  expected_target_commit_id: string;
  draft?: boolean;
  review_owner_id?: string;
  steward_id?: string;
  workspace_id?: string;
  release_lane_id?: string;
}

export interface MergeProjectPullRequestInput {
  expected_source_commit_id: string;
  expected_target_commit_id: string;
  strategy?: 'deterministic_merge';
  message?: string;
  decisions?: MergeDecision;
}

export async function listProjectPullRequests(
  projectId: string,
  options: { query?: string; status?: 'active' | 'merged' | 'all' } = {}
): Promise<ProjectPullRequestListData> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.query) params.set('query', options.query);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests${suffix}`
  );
  return handleResponse<ProjectPullRequestListData>(res);
}

export async function listProjectPullRequestComparisons(
  projectId: string,
  options: { base?: string } = {}
): Promise<ProjectPullRequestCompareData> {
  const params = new URLSearchParams();
  if (options.base) params.set('base', options.base);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests/compare${suffix}`
  );
  return handleResponse<ProjectPullRequestCompareData>(res);
}

export async function createProjectPullRequest(
  projectId: string,
  input: CreateProjectPullRequestInput
): Promise<ApiProjectPullRequestDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests`,
    {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<ApiProjectPullRequestDetail>(res);
}

export async function getProjectPullRequest(
  projectId: string,
  number: number
): Promise<ApiProjectPullRequestDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests/${number}`
  );
  return handleResponse<ApiProjectPullRequestDetail>(res);
}

export async function mergeProjectPullRequest(
  projectId: string,
  number: number,
  input: MergeProjectPullRequestInput
): Promise<ApiProjectPullRequestDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests/${number}/merge`,
    {
      body: JSON.stringify({ strategy: 'deterministic_merge', ...input }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<ApiProjectPullRequestDetail>(res);
}

export async function closeProjectPullRequest(
  projectId: string,
  number: number
): Promise<ApiProjectPullRequest> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests/${number}/close`,
    {
      method: 'POST',
    }
  );
  return handleResponse<ApiProjectPullRequest>(res);
}

export async function rerunProjectPullRequestReadiness(
  projectId: string,
  number: number
): Promise<ApiProjectPullRequestDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pull-requests/${number}/checks/rerun`,
    {
      method: 'POST',
    }
  );
  return handleResponse<ApiProjectPullRequestDetail>(res);
}
