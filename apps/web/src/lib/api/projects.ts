/**
 * Projects CRUD API
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';
import type { Project, ProjectDetail, ProjectListData } from './types';

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
  verified_at: string;
}

/**
 * Verify the hash chain integrity of a project.
 */
export async function verifyProjectHashChain(projectId: string): Promise<VerifyResult> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/verify`);
  return handleResponse<VerifyResult>(res);
}
