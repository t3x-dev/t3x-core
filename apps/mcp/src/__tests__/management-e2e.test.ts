/**
 * Phase 3 E2E Test: Management — Leaves, Export, Delete
 *
 * Requires: API server running on port 8000
 */
import { beforeAll, describe, expect, it } from 'vitest';

const API_BASE = process.env.T3X_API_URL || 'http://localhost:8000/api';

async function getTestApiKey(): Promise<string> {
  const username = `e2e_mgmt_${Date.now()}`;
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test_password_123' }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const body = await res.json();
  return body.data.api_key;
}

describe('MCP Management E2E: Leaves + Export + Delete', () => {
  let apiKey: string;
  let projectId: string;
  let commitHash: string;

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

  async function apiCallRaw(method: string, path: string) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res;
  }

  beforeAll(async () => {
    apiKey = await getTestApiKey();

    // Create project + commit for leaf testing
    const proj = await apiCall('POST', '/v1/projects', { name: 'Management Test' });
    projectId = proj.project_id;

    const ext = await apiCall('POST', '/v1/extract', {
      project_id: projectId,
      text: 'User: Our budget is $10000.\nAssistant: Noted.',
    });
    const commit = await apiCall('POST', '/v1/commit', {
      project_id: projectId,
      draft_id: ext.draft_id,
      message: 'Initial data',
    });
    commitHash = commit.commit_hash;
  }, 30000);

  it('Step 1: list leaves (empty)', async () => {
    const data = await apiCall('GET', `/v1/projects/${projectId}/leaves`);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('Step 2: create leaf', async () => {
    const data = await apiCall('POST', '/v1/leaves', {
      project_id: projectId,
      commit_hash: commitHash,
      type: 'tweet',
      title: 'Budget tweet',
    });
    expect(data.id).toBeTruthy();
    expect(data.type).toBe('tweet');
  });

  it('Step 3: list leaves (has one)', async () => {
    const data = await apiCall('GET', `/v1/projects/${projectId}/leaves`);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 4: export project', async () => {
    const res = await apiCallRaw('GET', `/v1/export/ledger?project_id=${projectId}`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it('Step 5: delete project (soft)', async () => {
    const data = await apiCall('DELETE', `/v1/projects/${projectId}`);
    // Soft delete returns success
    expect(data).toBeDefined();
  });

  it('Step 6: verify project is soft-deleted (list excludes it)', async () => {
    const data = await apiCall('GET', '/v1/projects');
    const ids = data.projects.map((p: { project_id: string }) => p.project_id);
    expect(ids).not.toContain(projectId);
  });
});
