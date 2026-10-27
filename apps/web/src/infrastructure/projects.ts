import type { RepositoryAddress, RepositoryNameCheck } from '@t3x-dev/api-client';
/**
 * Projects CRUD API
 */

import type {
  ChangeProjectVisibilityInput,
  ChangeProjectVisibilityResult,
  CreateProjectInput,
  RepositoryProfilePatch,
} from '@t3x-dev/api-client';
import { API_V1, ApiError, buildQueryString, fetchWithTimeout, handleResponse } from './core';
import { getSharedApiClient } from './sharedApiClient';
import type { ExtractionStyleConfig, Project, ProjectDetail, ProjectListData } from './types';

export async function listProjects(
  limit = 50,
  offset = 0,
  namespace?: string,
  status?: 'active' | 'deleted'
): Promise<ProjectListData> {
  const query = buildQueryString({ limit, offset, namespace, status });
  const res = await fetchWithTimeout(`${API_V1}/projects?${query}`);
  const data = await handleResponse<ProjectListData>(res);
  // Older servers ignore status=deleted and return active rows without action
  // capabilities. Never present that successful but incompatible response as a
  // deleted list or infer destructive permissions on the client.
  if (
    status === 'deleted' &&
    (data?.status !== 'deleted' ||
      !Array.isArray(data.projects) ||
      data.projects.some(
        (project) =>
          !project ||
          typeof project.deleted_at !== 'string' ||
          !Number.isFinite(Date.parse(project.deleted_at)) ||
          typeof project.can_restore !== 'boolean' ||
          typeof project.can_permanently_delete !== 'boolean' ||
          (namespace !== undefined && project.namespace !== namespace)
      ))
  ) {
    throw new ApiError(
      'INCOMPATIBLE_REPOSITORY_LIFECYCLE_API',
      'The running API server returned an incompatible deleted-repository list. Update or restart the API server, then retry.'
    );
  }
  return data;
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`);
  return handleResponse<ProjectDetail>(res);
}

export async function createProject(
  name: string,
  metadata?: Record<string, unknown>,
  namespace?: string,
  starter?: CreateProjectInput['starter'],
  profile?: Pick<CreateProjectInput, 'initialize_readme' | 'tags'>
): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata, namespace, starter, ...profile }),
  });
  return handleResponse<Project>(res);
}

export async function ensureDemoProject(): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects/demo-workspace`, {
    method: 'POST',
  });
  return handleResponse<Project>(res);
}

export interface DeleteProjectResponse {
  deleted: boolean;
  project_id: string;
}

export async function deleteProject(
  projectId: string,
  options?: { permanent?: boolean; onlyIfDeleted?: boolean }
): Promise<DeleteProjectResponse> {
  const suffix = options?.permanent
    ? `?permanent=true${options.onlyIfDeleted ? '&only_if_deleted=true' : ''}`
    : '';
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}${suffix}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<DeleteProjectResponse>(res);
}

export async function restoreProject(projectId: string): Promise<Project> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/restore`,
    {
      method: 'POST',
    }
  );
  return handleResponse<Project>(res);
}

export interface UpdateProjectPayload {
  repository_profile?: RepositoryProfilePatch;
  name?: string;
  metadata?: Record<string, unknown>;
  default_provider?: string | null;
  default_model?: string | null;
  extraction_style?: ExtractionStyleConfig | null;
}

export async function updateProject(
  projectId: string,
  payload: UpdateProjectPayload
): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Project>(res);
}

export type ChangeProjectVisibilityPayload = ChangeProjectVisibilityInput;
export type ChangeProjectVisibilityResponse = ChangeProjectVisibilityResult;

export async function changeProjectVisibility(
  projectId: string,
  payload: ChangeProjectVisibilityPayload
): Promise<ChangeProjectVisibilityResponse> {
  return getSharedApiClient().changeProjectVisibility(projectId, payload);
}

// ============================================================================
// YSchema Validation Runs
// ============================================================================

export type YSchemaValidationRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'stale';

export interface YSchemaValidationRun {
  checked_at?: string | null;
  commit_hash: string;
  created_at: string;
  error_count: number;
  finished_at: string | null;
  fix_count: number;
  gap_count: number;
  id: string;
  project_id: string;
  ready: boolean;
  result: Record<string, unknown>;
  schema_hash: string;
  schema_name: string;
  schema_version: string;
  started_at: string | null;
  status: YSchemaValidationRunStatus;
  valid: boolean;
  validator_version: string;
}

export interface LatestYSchemaValidationRunOptions {
  commitHash?: string;
  schemaName?: string;
}

export async function getLatestYSchemaValidationRun(
  projectId: string,
  options: LatestYSchemaValidationRunOptions = {}
): Promise<YSchemaValidationRun | null> {
  const query = buildQueryString({
    commit_hash: options.commitHash,
    schema_name: options.schemaName,
  });
  const suffix = query ? `?${query}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschema-validation/latest${suffix}`
  );
  return handleResponse<YSchemaValidationRun | null>(res);
}

export interface CreateYSchemaValidationRunPayload {
  commit_hash?: string;
  schema_name?: string;
}

export async function createYSchemaValidationRun(
  projectId: string,
  payload: CreateYSchemaValidationRunPayload = {}
): Promise<YSchemaValidationRun> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschema-validation/runs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  return handleResponse<YSchemaValidationRun>(res);
}

// ============================================================================
// Deterministic Skill artifacts
// ============================================================================

export interface SkillArtifactFile {
  path: string;
  media_type: string;
  content: string;
  sha256: string;
}

export interface SkillArtifactCheck {
  key: string;
  kind: string;
  run_when: string;
  blocking: boolean;
  command_resource?: string;
  assertions: string[];
  success_criteria: string[];
  workflow_keys: string[];
}

export interface SkillArtifactIssue {
  code: string;
  path: string;
  message: string;
}

export interface SkillArtifact {
  commit_hash: string;
  schema_name: 't3x/skill';
  renderer_version: string;
  generated_description: string;
  bundle_hash: string;
  publishable: boolean;
  missing_resources: string[];
  gate: {
    declaratively_ready: boolean;
    blocking_check_count: number;
    requires_execution: boolean;
    errors: SkillArtifactIssue[];
    gaps: SkillArtifactIssue[];
  };
  checks: SkillArtifactCheck[];
  files: SkillArtifactFile[];
}

export async function getSkillArtifact(
  projectId: string,
  commitHash: string
): Promise<SkillArtifact> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/commits/${encodeURIComponent(commitHash)}/artifacts/skill`
  );
  return handleResponse<SkillArtifact>(res);
}

// ============================================================================
// Hash Chain Verification
// ============================================================================

/** Hash chain verification result */
export interface VerifyResult {
  valid: boolean;
  total: number;
  verified_depth: number;
  entry_points: number;
  errors: {
    hash_mismatch: string[];
    parent_not_found: string[];
    other: string[];
  };
  merkle_roots?: Record<string, string>;
  merkle_mismatches?: string[];
  truncated?: boolean;
  verified_at: string;
}

/** Quick Merkle root verification result */
export interface QuickVerifyResult {
  valid: boolean;
  checked: number;
  mismatches: string[];
  missing_roots: string[];
  verified_at: string;
}

/** Merkle root backfill result */
export interface BackfillResult {
  updated: number;
  remaining: boolean;
  verified_at: string;
}

/**
 * Verify the hash chain integrity of a project.
 */
export async function verifyProjectHashChain(projectId: string): Promise<VerifyResult> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/verify`);
  return handleResponse<VerifyResult>(res);
}

/** Quick verify — checks recent commits' Merkle roots (millisecond-level) */
export async function quickVerifyProject(projectId: string): Promise<QuickVerifyResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/verify/quick`
  );
  return handleResponse<QuickVerifyResult>(res);
}

/** Backfill missing Merkle roots (batch, max 10K) */
export async function backfillMerkle(projectId: string): Promise<BackfillResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/backfill-merkle`,
    { method: 'POST' }
  );
  return handleResponse<BackfillResult>(res);
}

export function resolveRepository(owner: string, name: string): Promise<RepositoryAddress> {
  return getSharedApiClient().resolveRepository(owner, name);
}
export function checkRepositoryName(
  namespace: string,
  name: string,
  projectId?: string
): Promise<RepositoryNameCheck> {
  return getSharedApiClient().checkRepositoryName(namespace, name, projectId);
}
