/**
 * Branch rules API — whether a branch requires review by someone other than
 * the proposer.
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

export interface BranchRule {
  ref_name: string;
  require_independent_review: boolean;
  source: 'default' | 'preset' | 'custom';
}

export async function getBranchRule(projectId: string, refName: string): Promise<BranchRule> {
  const query = buildQueryString({ ref_name: refName });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/branch-rule?${query}`
  );
  return handleResponse<BranchRule>(res);
}

export async function setBranchRule(
  projectId: string,
  refName: string,
  requireIndependentReview: boolean
): Promise<BranchRule> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/branch-rule`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_name: refName,
        require_independent_review: requireIndependentReview,
      }),
    }
  );
  return handleResponse<BranchRule>(res);
}
