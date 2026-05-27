/**
 * Project materials API.
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface Material {
  id: string;
  project_id: string;
  source_type: 'document' | 'url' | 'platform';
  title: string;
  filename: string | null;
  mime_type: string | null;
  content_hash: string;
  content_excerpt: string;
  token_estimate: number;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

export async function listMaterialsByProject(projectId: string): Promise<Material[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/materials`
  );
  return handleResponse<Material[]>(res);
}

export async function uploadDocumentMaterial(projectId: string, file: File): Promise<Material> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/materials/document`,
    {
      method: 'POST',
      body: form,
    }
  );
  return handleResponse<Material>(res);
}
