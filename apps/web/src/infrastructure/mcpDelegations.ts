import type {
  ConnectionChoices,
  ConsentDecision,
  DelegationConsent,
  DelegationUpdate,
  RepositoryDelegation,
  SavedSelection,
} from '@/domain/mcpDelegation';
import { ApiError, fetchWithTimeout } from './core';

const path = '/api/v1/mcp-delegations';

async function request<T>(
  url: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    method,
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'UNAUTHENTICATED'
        : response.status === 409
          ? 'PREVIEW_CONFLICT'
          : response.status === 403 || response.status === 404
            ? 'DELEGATION_UNAVAILABLE'
            : 'DELEGATION_FAILED',
      typeof data?.error === 'string'
        ? data.error
        : (data?.error?.message ?? `T3X could not complete the request (HTTP ${response.status}).`)
    );
  }
  return data as T;
}

export function readDelegationConsent(query: string, signal: AbortSignal) {
  return request<DelegationConsent>(`${path}/consent?${query}`, 'GET', undefined, signal);
}

export function decideDelegationConsent(query: string, input: ConsentDecision) {
  return request<{ redirectTo: string }>(`${path}/consent?${query}`, 'POST', input);
}

export function readConnectionChoices(_key: string, signal: AbortSignal) {
  return request<ConnectionChoices>(`${path}/preselections`, 'GET', undefined, signal);
}

export function saveConnectionSelection(input: {
  projectId: string;
  clientId: string;
  branch: string;
}) {
  return request<SavedSelection>(`${path}/preselections`, 'POST', input);
}

export function readRepositoryDelegations(query: string, signal: AbortSignal) {
  return request<{ grants: RepositoryDelegation[] }>(`${path}?${query}`, 'GET', undefined, signal);
}

export function updateRepositoryDelegation(
  projectId: string,
  id: string,
  update: DelegationUpdate | { repair: true; branch: string }
) {
  return request<void>(path, 'PATCH', { projectId, id, ...update });
}

export function revokeRepositoryDelegation(projectId: string, id: string) {
  return request<void>(path, 'DELETE', { projectId, id });
}
