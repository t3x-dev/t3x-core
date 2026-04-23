import type {
  LocalAccessCheckResult,
  LocalConfigState,
  UpdateLocalConfigInput,
} from '@/domain/accessConfig';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type { LocalAccessCheckResult, LocalConfigState, UpdateLocalConfigInput };

export async function getLocalConfig(): Promise<LocalConfigState> {
  const res = await fetchWithTimeout(`${API_V1}/local-config`);
  return handleResponse<LocalConfigState>(res);
}

export async function updateLocalConfig(input: UpdateLocalConfigInput): Promise<LocalConfigState> {
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
