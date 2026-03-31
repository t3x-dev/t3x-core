import type { APIRequestContext } from '@playwright/test';

export const API_BASE = 'http://localhost:8000/api/v1';

/**
 * Create a test project via API
 */
export async function createTestProject(
  request: APIRequestContext,
  name?: string
): Promise<{ projectId: string; name: string }> {
  const projectName = name || `E2E Test ${Date.now()}`;
  const response = await request.post(`${API_BASE}/projects`, {
    data: { name: projectName },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create project: ${data.error?.message}`);
  return { projectId: data.data.project_id, name: projectName };
}

/**
 * Create a conversation in a project
 */
export async function createTestConversation(
  request: APIRequestContext,
  projectId: string,
  title?: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/conversations`, {
    data: { project_id: projectId, title: title || 'Test Conversation' },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create conversation: ${data.error?.message}`);
  return data.data.conversation_id;
}

/**
 * Create a turn in a conversation
 */
export async function createTestTurn(
  request: APIRequestContext,
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/turns`, {
    data: { project_id: projectId, conversation_id: conversationId, role, content },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create turn: ${data.error?.message}`);
  return data.data.turn_hash;
}

/**
 * Create a frame-based commit
 */
export async function createTestCommit(
  request: APIRequestContext,
  projectId: string,
  nodes: Array<{ id: string; text: string }>,
  options?: { branch?: string; message?: string; parents?: string[] }
): Promise<string> {
  const trees = nodes.map((s) => ({
    key: s.id,
    type: 'legacy_sentence',
    slots: { text: s.text },
    children: [],
  }));
  const response = await request.post(`${API_BASE}/commits`, {
    data: {
      project_id: projectId,
      content: { trees, relations: [] },
      author: { type: 'human', name: 'E2E Tester' },
      branch: options?.branch || 'main',
      message: options?.message || 'E2E test commit',
      parents: options?.parents,
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create commit: ${data.error?.message}`);
  return data.data.commit.hash;
}

/**
 * Create a leaf from a commit
 */
export async function createTestLeaf(
  request: APIRequestContext,
  commitHash: string,
  projectId: string,
  constraints?: Array<{ type: string; value: string; match_mode?: string }>
): Promise<string> {
  const response = await request.post(`${API_BASE}/leaves`, {
    data: {
      commit_hash: commitHash,
      project_id: projectId,
      type: 'deploy_agent',
      title: 'E2E Test Leaf',
      constraints: constraints || [],
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create leaf: ${data.error?.message}`);
  return data.data.id;
}

/**
 * Create a pin
 */
export async function createTestPin(
  request: APIRequestContext,
  projectId: string,
  type: 'conversation' | 'leaf',
  refId: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/projects/${projectId}/pins`, {
    data: { type, ref_id: refId },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create pin: ${data.error?.message}`);
  return data.data.id;
}

/**
 * Create a merge draft
 */
export async function createTestMergeDraft(
  request: APIRequestContext,
  projectId: string,
  sourceHash: string,
  targetHash: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/merge/drafts`, {
    data: { project_id: projectId, source_hash: sourceHash, target_hash: targetHash },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create merge draft: ${data.error?.message}`);
  return data.data.draftId;
}

/**
 * Delete a project (cleanup)
 */
export async function cleanupProject(request: APIRequestContext, projectId: string): Promise<void> {
  await request.delete(`${API_BASE}/projects/${projectId}`);
}

/**
 * Cleanup multiple projects
 */
export async function cleanupProjects(
  request: APIRequestContext,
  projectIds: string[]
): Promise<void> {
  await Promise.all(projectIds.map((id) => cleanupProject(request, id)));
}

/**
 * Create a deploy agent
 */
export async function createTestDeployAgent(
  request: APIRequestContext,
  id: string,
  name: string,
  endpoint: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/deploy-agents`, {
    data: { id, name, endpoint, type: 'http' },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create deploy agent: ${data.error?.message}`);
  return data.data.deploy_agent_id;
}

/**
 * Delete a deploy agent (cleanup)
 */
export async function cleanupDeployAgent(
  request: APIRequestContext,
  agentId: string
): Promise<void> {
  await request.delete(`${API_BASE}/deploy-agents/${agentId}`);
}

/**
 * Create a branch
 */
export async function createTestBranch(
  request: APIRequestContext,
  projectId: string,
  name: string,
  options?: { parentBranch?: string; description?: string }
): Promise<{ branchId: string; name: string }> {
  const response = await request.post(`${API_BASE}/branches`, {
    data: {
      project_id: projectId,
      name,
      parent_branch: options?.parentBranch,
      description: options?.description,
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create branch: ${data.error?.message}`);
  return { branchId: data.data.branch_id, name: data.data.name };
}

/**
 * List branches for a project
 */
export async function listTestBranches(
  request: APIRequestContext,
  projectId: string
): Promise<
  Array<{ branch_id: string; name: string; is_current: boolean; head_commit_hash: string | null }>
> {
  const response = await request.get(`${API_BASE}/branches?project_id=${projectId}`);
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to list branches: ${data.error?.message}`);
  return data.data.branches;
}

/**
 * Switch to a branch
 */
export async function switchTestBranch(
  request: APIRequestContext,
  projectId: string,
  branchName: string
): Promise<{ branch_id: string; name: string; is_current: boolean }> {
  const response = await request.post(`${API_BASE}/branches/switch`, {
    data: { project_id: projectId, branch_name: branchName },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to switch branch: ${data.error?.message}`);
  return data.data;
}

/**
 * Get current branch
 */
export async function getCurrentBranch(
  request: APIRequestContext,
  projectId: string
): Promise<{
  branch_id: string;
  name: string;
  is_current: boolean;
  head_commit_hash: string | null;
}> {
  const response = await request.get(`${API_BASE}/branches/current?project_id=${projectId}`);
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to get current branch: ${data.error?.message}`);
  return data.data;
}

/**
 * Create a run via API
 */
export async function createTestRun(
  request: APIRequestContext,
  leafId: string,
  options?: { projectId?: string; model?: string; promptVersion?: string }
): Promise<string> {
  const response = await request.post(`${API_BASE}/runs`, {
    data: {
      project_id: options?.projectId,
      leaf: { id: leafId, type: 'eval' },
      metadata: {
        model: options?.model || 'test-model',
        prompt_version: options?.promptVersion || 'v1',
      },
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Failed to create run: ${data.error?.message}`);
  return data.data.run_id;
}
