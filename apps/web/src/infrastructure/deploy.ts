/**
 * Deploy Agents API (Database-backed)
 * Note: This is different from the "agent" layer (LLM draft generation)
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// Deploy Agent stored in database
export interface DeployAgent {
  deploy_agent_id: string;
  project_id: string | null;
  name: string;
  endpoint: string;
  type: string;
  auth: {
    type: 'bearer' | 'api_key';
    token: string;
    header?: string;
  } | null;
  status: 'idle' | 'running' | 'error';
  last_run_id: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeployAgentListData {
  deploy_agents: DeployAgent[];
  limit: number;
  offset: number;
}

/**
 * List deploy agents from database
 */
export async function listDeployAgents(options?: {
  project_id?: string;
  limit?: number;
  offset?: number;
}): Promise<DeployAgentListData> {
  const query = buildQueryString({
    project_id: options?.project_id,
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  });
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents?${query}`);
  return handleResponse<DeployAgentListData>(res);
}

/**
 * Get deploy agent by ID from database
 */
export async function getDeployAgent(deployAgentId: string): Promise<DeployAgent> {
  const res = await fetchWithTimeout(
    `${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`
  );
  return handleResponse<DeployAgent>(res);
}

/**
 * Create deploy agent in database
 */
export async function createDeployAgent(input: {
  id: string;
  name: string;
  endpoint: string;
  type?: 'http' | 'websocket' | 'grpc';
  project_id?: string;
  auth?: {
    type: 'bearer' | 'api_key';
    token: string;
    header?: string;
  };
}): Promise<DeployAgent> {
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<DeployAgent>(res);
}

/**
 * Update deploy agent in database
 */
export async function updateDeployAgent(
  deployAgentId: string,
  updates: {
    name?: string;
    endpoint?: string;
    type?: 'http' | 'websocket' | 'grpc';
    auth?: {
      type: 'bearer' | 'api_key';
      token: string;
      header?: string;
    } | null;
    status?: 'idle' | 'running' | 'error';
    last_run_id?: string;
    last_run_at?: string;
  }
): Promise<DeployAgent> {
  const res = await fetchWithTimeout(
    `${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return handleResponse<DeployAgent>(res);
}

/**
 * Delete deploy agent from database
 */
export async function deleteDeployAgent(
  deployAgentId: string
): Promise<{ deleted: boolean; deploy_agent_id: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<{ deleted: boolean; deploy_agent_id: string }>(res);
}
