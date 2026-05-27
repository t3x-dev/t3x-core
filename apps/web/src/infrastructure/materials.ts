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
  archived_at: string | null;
  created_by: string | null;
}

export interface MaterialSegment {
  id: string;
  index: number;
  label: string;
  text: string;
  char_start: number;
  char_end: number;
  token_estimate: number;
}

export interface MaterialParseQuality {
  status: 'ready' | 'partial' | 'poor' | 'empty';
  score: number;
  message: string;
}

export interface MaterialDetail extends Material {
  content_text: string;
  page_count: number | null;
  segment_count: number;
  segments: MaterialSegment[];
  parse_quality: MaterialParseQuality;
}

export async function listMaterialsByProject(projectId: string): Promise<Material[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/materials`
  );
  return handleResponse<Material[]>(res);
}

export async function getMaterialDetail(
  projectId: string,
  materialId: string
): Promise<MaterialDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`
  );
  return handleResponse<MaterialDetail>(res);
}

export async function archiveProjectMaterial(
  projectId: string,
  materialId: string
): Promise<MaterialDetail> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<MaterialDetail>(res);
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
