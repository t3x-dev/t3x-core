/**
 * Branches CRUD API
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';
import type { Branch, BranchListData } from './types';

export async function listBranches(projectId: string): Promise<BranchListData> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/branches?${query}`);
  return handleResponse<BranchListData>(res);
}

export async function getCurrentBranch(projectId: string): Promise<{
  project_id: string;
  current_branch: string;
  head_commit_hash?: string;
}> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/branches/current?${query}`);
  return handleResponse<{
    project_id: string;
    current_branch: string;
    head_commit_hash?: string;
  }>(res);
}

export async function createBranch(
  projectId: string,
  name: string,
  parentBranch?: string,
  description?: string,
  checkout = false
): Promise<Branch> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name,
      parent_branch: parentBranch, // Fixed: was 'from_branch', backend expects 'parent_branch'
      description,
      checkout,
    }),
  });
  return handleResponse<Branch>(res);
}

export async function switchBranch(
  projectId: string,
  name: string,
  create = false,
  fromBranch?: string
): Promise<Branch> {
  const res = await fetchWithTimeout(`${API_V1}/branches/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name,
      create,
      from_branch: fromBranch,
    }),
  });
  return handleResponse<Branch>(res);
}

export async function deleteBranch(projectId: string, name: string, force = false): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, name, force }),
  });
  await handleResponse(res);
}
