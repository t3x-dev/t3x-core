/**
 * Phase 2 E2E Test: Diff + Branch
 *
 * Requires: API server running on port 8000
 */
import { beforeAll, describe, expect, it } from 'vitest';

const API_BASE = process.env.T3X_API_URL || 'http://localhost:8000/api';

async function getTestApiKey(): Promise<string> {
  const username = `e2e_ver_${Date.now()}`;
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test_password_123' }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const body = await res.json();
  return body.data.api_key;
}

describe('MCP Versioning E2E: Diff + Branch', () => {
  let apiKey: string;
  let projectId: string;
  let firstCommitHash: string;
  let secondCommitHash: string;

  async function apiCall(method: string, path: string, body?: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) throw new Error(`API error: ${JSON.stringify(json.error)}`);
    return json.data;
  }

  beforeAll(async () => {
    apiKey = await getTestApiKey();
    // Create project + first commit
    const proj = await apiCall('POST', '/v1/projects', { name: 'Versioning Test' });
    projectId = proj.project_id;

    const ext1 = await apiCall('POST', '/v1/extract', {
      project_id: projectId,
      text: 'User: We need 3 engineers by March.\nAssistant: Got it, 3 engineers.',
    });
    const commit1 = await apiCall('POST', '/v1/commit', {
      project_id: projectId,
      draft_id: ext1.draft_id,
      message: 'First extraction',
    });
    firstCommitHash = commit1.commit_hash;

    // Second commit
    const ext2 = await apiCall('POST', '/v1/extract', {
      project_id: projectId,
      text: 'User: Actually make it 5 engineers.\nAssistant: Updated to 5.',
    });
    const commit2 = await apiCall('POST', '/v1/commit', {
      project_id: projectId,
      draft_id: ext2.draft_id,
      message: 'Updated headcount',
    });
    secondCommitHash = commit2.commit_hash;
  }, 60000);

  it('Step 1: list commits', async () => {
    const data = await apiCall('GET', `/v1/projects/${projectId}/commits`);
    expect(data.commits.length).toBeGreaterThanOrEqual(2);
  });

  it('Step 2: diff two commits', async () => {
    const data = await apiCall('POST', '/v1/diff/two-way', {
      base_commit_hash: firstCommitHash,
      target_commit_hash: secondCommitHash,
    });
    expect(data).toBeDefined();
  });

  it('Step 3: create experiment branch', async () => {
    const data = await apiCall('POST', '/v1/branches', {
      project_id: projectId,
      name: 'experiment',
    });
    expect(data.name).toBe('experiment');
  });

  it('Step 4: switch to experiment branch', async () => {
    const data = await apiCall('POST', '/v1/branches/switch', {
      project_id: projectId,
      branch_name: 'experiment',
    });
    expect(data.name).toBe('experiment');
  });

  it('Step 5: list all branches', async () => {
    const data = await apiCall('GET', `/v1/branches?project_id=${projectId}`);
    const names = data.branches.map((b: { name: string }) => b.name);
    expect(names).toContain('experiment');
    expect(data.branches.length).toBeGreaterThanOrEqual(1);
  });
});
