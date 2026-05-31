/**
 * Projects CRUD API
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';
import type { ExtractionStyleConfig, Project, ProjectDetail, ProjectListData } from './types';

export async function listProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  const query = buildQueryString({ limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/projects?${query}`);
  return handleResponse<ProjectListData>(res);
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`);
  return handleResponse<ProjectDetail>(res);
}

export async function createProject(
  name: string,
  metadata?: Record<string, unknown>
): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata }),
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

export async function deleteProject(projectId: string): Promise<DeleteProjectResponse> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return handleResponse<DeleteProjectResponse>(res);
}

export interface UpdateProjectPayload {
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
