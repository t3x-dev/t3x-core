import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface BusinessRuleConfig {
  id: string;
  type: 'rule' | 'llm';
  rule?: string;
  prompt?: string;
  message?: string;
  severity: 'error' | 'warning';
}

export async function getBusinessRules(projectId: string): Promise<BusinessRuleConfig[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/business-rules`
  );
  const data = await handleResponse<{ rules: BusinessRuleConfig[] }>(res);
  return data.rules;
}

export async function putBusinessRules(
  projectId: string,
  rules: BusinessRuleConfig[]
): Promise<BusinessRuleConfig[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/business-rules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    }
  );
  const data = await handleResponse<{ rules: BusinessRuleConfig[] }>(res);
  return data.rules;
}
