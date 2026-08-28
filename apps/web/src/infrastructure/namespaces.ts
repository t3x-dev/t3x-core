import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface NamespaceProfile {
  namespace_id: string;
  slug: string;
  kind: 'personal' | 'organization';
  display_name: string;
  created_at: string;
}

export async function createPersonalNamespace(slug: string): Promise<NamespaceProfile> {
  const res = await fetchWithTimeout(`${API_V1}/namespaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  return handleResponse<NamespaceProfile>(res);
}
