import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface LocalConfigState {
  api_url: string;
  api_url_source: 'env' | 'file' | 'default';
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  api_key_preview: string | null;
  config_path: string;
}

export interface UpdateLocalConfigInput {
  api_url?: string;
  api_key?: string;
}

export interface LocalAccessCheckResult {
  ok: boolean;
  code:
    | 'ACCESS_OK'
    | 'AUTH_NOT_REQUIRED'
    | 'MISSING_API_KEY'
    | 'INVALID_API_KEY'
    | 'API_UNREACHABLE'
    | 'API_ERROR';
  auth_mode: 'open' | 'protected' | 'unreachable';
  message: string;
  api_url: string;
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  status_code: number | null;
}

export async function getLocalConfig(): Promise<LocalConfigState> {
  const res = await fetchWithTimeout(`${API_V1}/local-config`);
  return handleResponse<LocalConfigState>(res);
}

export async function updateLocalConfig(
  input: UpdateLocalConfigInput
): Promise<LocalConfigState> {
  const res = await fetchWithTimeout(`${API_V1}/local-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<LocalConfigState>(res);
}

export async function deleteLocalApiKey(): Promise<LocalConfigState> {
  const res = await fetchWithTimeout(`${API_V1}/local-config/api-key`, {
    method: 'DELETE',
  });
  return handleResponse<LocalConfigState>(res);
}

export async function checkLocalAccess(): Promise<LocalAccessCheckResult> {
  const res = await fetchWithTimeout(`${API_V1}/local-config/check`, {
    method: 'POST',
  });
  return handleResponse<LocalAccessCheckResult>(res);
}
