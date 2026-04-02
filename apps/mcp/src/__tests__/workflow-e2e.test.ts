/**
 * Phase 1 E2E Test: Extract → Triage → Edit → Commit
 *
 * Requires: API server running on port 8000
 * Run: T3X_API_URL=http://localhost:8000/api npx vitest run src/__tests__/workflow-e2e.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';

const API_BASE = process.env.T3X_API_URL || 'http://localhost:8000/api';

async function getTestApiKey(): Promise<string> {
  const username = `e2e_mcp_${Date.now()}`;
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test_password_123' }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const body = await res.json();
  return body.data.api_key;
}

describe('MCP Workflow E2E: Extract → Triage → Edit → Commit', () => {
  let apiKey: string;
  let projectId: string;
  let draftId: string;
  let revision: number;
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

  beforeAll(async () => {
    apiKey = await getTestApiKey();
  });

  it('Step 1: list projects', async () => {
    const data = await apiCall('GET', '/v1/projects');
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it('Step 2: create project', async () => {
    const data = await apiCall('POST', '/v1/projects', {
      name: 'Japan Trip Planning',
      description: 'E2E test project for MCP workflow',
    });
    expect(data.project_id).toMatch(/^proj_/);
    projectId = data.project_id;
  });

  it('Step 3: extract knowledge from conversation', { timeout: 30000 }, async () => {
    const text = [
      'User: We are planning a trip to Japan next spring.',
      'Assistant: Great choice! What is your budget?',
      'User: Around $5000 for two weeks. We want to visit Tokyo and Kyoto.',
      'Assistant: Those are popular destinations. Any dietary restrictions?',
      'User: I am vegetarian. My partner eats everything.',
      'User: Actually, let us make it $6000 budget to be safe.',
    ].join('\n');

    const data = await apiCall('POST', '/v1/extract', {
      project_id: projectId,
      text,
    });
    expect(data.draft_id).toBeTruthy();
    draftId = data.draft_id;
  });

  it('Step 4: show draft (triage step)', async () => {
    const data = await apiCall('GET', `/v1/drafts/${draftId}`);
    expect(data.nodes).toBeDefined();
    expect(data.revision).toBeGreaterThan(0);
    revision = data.revision;
  });

  it('Step 5: edit draft with YOps', async () => {
    // Use 'add' to add a new root node (doesn't depend on extracted node names)
    const data = await apiCall('POST', `/v1/drafts/${draftId}/apply-yops`, {
      yops: [
        {
          add: {
            parent: '',
            node: { budget_note: { amount: '$6000' } },
            source: { amount: 'let us make it $6000' },
            from: 'T6',
          },
        },
      ],
      if_revision: revision,
    });
    expect(data.applied_count).toBeGreaterThanOrEqual(1);
    expect(data.revision).toBe(revision + 1);
  });

  it('Step 6: show draft again to verify edit', async () => {
    const data = await apiCall('GET', `/v1/drafts/${draftId}`);
    expect(data.revision).toBe(revision + 1);
  });

  it('Step 7: commit the draft', async () => {
    const data = await apiCall('POST', '/v1/commit', {
      project_id: projectId,
      draft_id: draftId,
      message: 'Japan trip planning — extracted and triaged',
    });
    expect(data.commit_hash).toMatch(/^sha256:/);
    commitHash = data.commit_hash;
  });

  it('Step 8: verify committed knowledge', async () => {
    const data = await apiCall('GET', `/v1/projects/${projectId}/context`);
    expect(data.commit_hash).toBe(commitHash);
    expect(data.trees).toBeDefined();
  });
});
