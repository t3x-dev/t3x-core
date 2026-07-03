import type { CreatedT3xApiKey, CreateT3xApiKeyInput, T3xApiKey } from '@/domain/apiKeys';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type { CreatedT3xApiKey, CreateT3xApiKeyInput, T3xApiKey };

export async function listApiKeys(): Promise<T3xApiKey[]> {
  const res = await fetchWithTimeout(`${API_V1}/api-keys`);
  return handleResponse<T3xApiKey[]>(res);
}

export async function createApiKey(input: CreateT3xApiKeyInput): Promise<CreatedT3xApiKey> {
  const res = await fetchWithTimeout(`${API_V1}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<CreatedT3xApiKey>(res);
}

export async function revokeApiKey(id: string): Promise<T3xApiKey> {
  const res = await fetchWithTimeout(`${API_V1}/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse<T3xApiKey>(res);
}
