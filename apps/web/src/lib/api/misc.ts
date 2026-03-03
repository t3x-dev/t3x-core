/**
 * Miscellaneous API: Share Links, Templates, Webhooks, Providers, Import, SSE Streaming
 */

import { API_V1, ApiError, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Share Links
// ============================================================================

export interface ShareLink {
  id: string;
  token: string;
  entity_type: string;
  entity_id: string;
  project_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ShareResolveResult {
  token_info: ShareLink;
  entity: unknown;
}

export async function createShareLink(
  entityType: 'leaf' | 'run' | 'comparison',
  entityId: string
): Promise<ShareLink> {
  const res = await fetchWithTimeout(`${API_V1}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
    }),
  });
  return handleResponse<ShareLink>(res);
}

export async function resolveShareLink(token: string): Promise<ShareResolveResult> {
  const res = await fetchWithTimeout(`${API_V1}/share/${token}`);
  return handleResponse<ShareResolveResult>(res);
}

export async function revokeShareLink(id: string): Promise<ShareLink> {
  const res = await fetchWithTimeout(`${API_V1}/share/${id}`, {
    method: 'DELETE',
  });
  return handleResponse<ShareLink>(res);
}

export async function listShareLinks(entityType: string, entityId: string): Promise<ShareLink[]> {
  const res = await fetchWithTimeout(`${API_V1}/share/entity/${entityType}/${entityId}`);
  return handleResponse<ShareLink[]>(res);
}

// ============================================================================
// Templates
// ============================================================================

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface Template {
  template_id: string;
  title: string;
  description: string;
  category: 'social' | 'business' | 'technical' | 'creative';
  leaf_type: string;
  system_prompt: string;
  user_prompt: string;
  variables: TemplateVariable[];
  tags: string[];
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  title: string;
  description: string;
  category: 'social' | 'business' | 'technical' | 'creative';
  leaf_type: string;
  system_prompt: string;
  user_prompt: string;
  variables: TemplateVariable[];
  tags: string[];
}

export async function listTemplates(opts?: {
  category?: string;
  leaf_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Template[]> {
  const params = new URLSearchParams();
  if (opts?.category) params.set('category', opts.category);
  if (opts?.leaf_type) params.set('leaf_type', opts.leaf_type);
  if (opts?.search) params.set('search', opts.search);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetchWithTimeout(`${API_V1}/templates${qs ? `?${qs}` : ''}`);
  return handleResponse<Template[]>(res);
}

export async function getTemplate(id: string): Promise<Template> {
  const res = await fetchWithTimeout(`${API_V1}/templates/${id}`);
  return handleResponse<Template>(res);
}

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const res = await fetchWithTimeout(`${API_V1}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Template>(res);
}

export async function deleteTemplate(id: string): Promise<{ deleted: true }> {
  const res = await fetchWithTimeout(`${API_V1}/templates/${id}`, {
    method: 'DELETE',
  });
  return handleResponse<{ deleted: true }>(res);
}

// ============================================================================
// Webhooks
// ============================================================================

export interface WebhookData {
  webhook_id: string;
  project_id: string | null;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret?: string;
  project_id?: string;
  active?: boolean;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  secret?: string;
  project_id?: string | null;
  active?: boolean;
}

export async function listWebhooks(): Promise<WebhookData[]> {
  const res = await fetchWithTimeout(`${API_V1}/webhooks`);
  return handleResponse<WebhookData[]>(res);
}

export async function createWebhook(input: CreateWebhookInput): Promise<WebhookData> {
  const res = await fetchWithTimeout(`${API_V1}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<WebhookData>(res);
}

export async function updateWebhook(id: string, input: UpdateWebhookInput): Promise<WebhookData> {
  const res = await fetchWithTimeout(`${API_V1}/webhooks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<WebhookData>(res);
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/webhooks/${id}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

export async function testWebhook(id: string): Promise<{ status: number; ok: boolean }> {
  const res = await fetchWithTimeout(`${API_V1}/webhooks/${id}/test`, {
    method: 'POST',
  });
  return handleResponse<{ status: number; ok: boolean }>(res);
}

// ============================================================================
// Providers
// ============================================================================

export interface ProviderInfo {
  id: string;
  name: string;
  role: string;
  configured: boolean;
  roles: string[];
  required_env_keys: string[];
  default_model: string | null;
  available_models: string[] | null;
}

export interface RoleAssignment {
  role: string;
  provider_ids: string[];
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  latency_ms?: number;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const res = await fetchWithTimeout(`${API_V1}/providers`);
  return handleResponse<ProviderInfo[]>(res);
}

export async function getProviderRoles(): Promise<RoleAssignment[]> {
  const res = await fetchWithTimeout(`${API_V1}/providers/roles`);
  return handleResponse<RoleAssignment[]>(res);
}

export async function updateProviderRoles(roles: RoleAssignment[]): Promise<RoleAssignment[]> {
  const res = await fetchWithTimeout(`${API_V1}/providers/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
  });
  return handleResponse<RoleAssignment[]>(res);
}

export async function testProvider(providerId: string): Promise<TestConnectionResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/providers/${encodeURIComponent(providerId)}/test`,
    { method: 'POST' },
    30000 // Longer timeout for connection test
  );
  return handleResponse<TestConnectionResult>(res);
}

export async function getProviderConfig(): Promise<{ roles: RoleAssignment[] }> {
  const res = await fetchWithTimeout(`${API_V1}/providers/config`);
  return handleResponse<{ roles: RoleAssignment[] }>(res);
}

export async function updateProviderConfig(
  roles: RoleAssignment[]
): Promise<{ roles: RoleAssignment[] }> {
  const res = await fetchWithTimeout(`${API_V1}/providers/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
  });
  return handleResponse<{ roles: RoleAssignment[] }>(res);
}

// ============================================================================
// Project Provider Config
// ============================================================================

export interface ProjectProviderConfig {
  roles: RoleAssignment[];
}

export async function getProjectProviderConfig(
  projectId: string
): Promise<ProjectProviderConfig | null> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`);
  const project = await handleResponse<{
    project_id: string;
    provider_config: ProjectProviderConfig | null;
    [key: string]: unknown;
  }>(res);
  return project.provider_config ?? null;
}

export async function updateProjectProviderConfig(
  projectId: string,
  config: ProjectProviderConfig | null
): Promise<ProjectProviderConfig | null> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider_config: config }),
  });
  const project = await handleResponse<{
    project_id: string;
    provider_config: ProjectProviderConfig | null;
    [key: string]: unknown;
  }>(res);
  return project.provider_config ?? null;
}

// ============================================================================
// Import API
// ============================================================================

export interface ImportParagraph {
  text: string;
  type: 'heading' | 'paragraph' | 'list_item' | 'code' | 'table' | 'blockquote';
  level?: number;
  index: number;
}

export interface ImportMetadata {
  source_type: 'url' | 'document' | 'platform';
  source_url?: string;
  source_filename?: string;
  platform?: string;
  title?: string;
  author?: string;
  published_at?: string;
  content_hash: string;
  content_length: number;
  content_truncated?: boolean;
  extraction_quality?: 'good' | 'partial' | 'poor';
  page_count?: number;
  imported_at: string;
}

export interface ImportPreviewResult {
  paragraphs: ImportParagraph[];
  metadata: ImportMetadata;
  estimated_turns: number;
  duplicate_warning?: string;
}

export interface ImportResult {
  project_id: string;
  conversation_id: string;
  turns_imported: number;
  metadata: ImportMetadata;
  duplicate_warning?: string;
}

export interface PlatformPreviewConversation {
  id: string;
  title: string;
  message_count: number;
  created_at?: string;
}

export interface PlatformPreviewResult {
  platform: string;
  conversations: PlatformPreviewConversation[];
}

export interface PlatformImportResult {
  project_id: string;
  imported: Array<{
    source_id: string;
    conversation_id: string;
    turns_imported: number;
    title: string;
  }>;
  total_conversations: number;
  total_turns: number;
}

export async function previewUrlImport(
  url: string,
  projectId?: string
): Promise<ImportPreviewResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/import/url/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, project_id: projectId }),
    },
    60000
  );
  return handleResponse<ImportPreviewResult>(res);
}

export async function importFromUrl(url: string, projectId: string): Promise<ImportResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/import/url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, project_id: projectId }),
    },
    60000
  );
  return handleResponse<ImportResult>(res);
}

export async function previewDocumentImport(
  file: File,
  projectId?: string
): Promise<ImportPreviewResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) formData.append('project_id', projectId);

  const res = await fetchWithTimeout(
    `${API_V1}/import/document/preview`,
    { method: 'POST', body: formData },
    60000
  );
  return handleResponse<ImportPreviewResult>(res);
}

export async function importDocument(file: File, projectId: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId);

  const res = await fetchWithTimeout(
    `${API_V1}/import/document`,
    { method: 'POST', body: formData },
    60000
  );
  return handleResponse<ImportResult>(res);
}

export async function previewPlatformImport(file: File): Promise<PlatformPreviewResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithTimeout(
    `${API_V1}/import/platform/preview`,
    { method: 'POST', body: formData },
    60000
  );
  return handleResponse<PlatformPreviewResult>(res);
}

export async function importFromPlatform(
  projectId: string,
  platformData: string,
  conversationIds?: string[]
): Promise<PlatformImportResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/import/platform`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        platform_data: platformData,
        conversation_ids: conversationIds,
      }),
    },
    120000
  );
  return handleResponse<PlatformImportResult>(res);
}

// ============================================================
// SSE Streaming Import (for large imports >= 50 estimated turns)
// ============================================================

/** SSE import event types */
export type ImportStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'progress'; current: number; total: number; message?: string }
  | { type: 'complete'; [key: string]: unknown }
  | { type: 'error'; message: string };

/** Threshold for switching to streaming import */
export const STREAMING_IMPORT_THRESHOLD = 50;

/** Parse SSE stream from import endpoints. */
async function* parseSseStream(response: Response): AsyncGenerator<ImportStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('STREAM_ERROR', 'No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') return;

        try {
          const event = JSON.parse(dataStr) as ImportStreamEvent;
          yield event;
        } catch {
          // Ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Extract error message from a non-OK SSE response */
async function throwStreamError(res: Response): Promise<never> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    throw new ApiError(
      body?.error?.code ?? 'IMPORT_FAILED',
      body?.error?.message ?? `Import failed with status ${res.status}`
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('IMPORT_FAILED', `Import failed with status ${res.status}`);
  }
}

/**
 * Stream URL import with SSE progress.
 */
export async function* streamUrlImport(
  url: string,
  projectId: string
): AsyncGenerator<ImportStreamEvent> {
  const res = await fetch(`${API_V1}/import/url/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, project_id: projectId }),
  });

  if (!res.ok) await throwStreamError(res);

  yield* parseSseStream(res);
}

/**
 * Stream document import with SSE progress.
 */
export async function* streamDocumentImport(
  file: File,
  projectId: string
): AsyncGenerator<ImportStreamEvent> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId);

  const res = await fetch(`${API_V1}/import/document/stream`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) await throwStreamError(res);

  yield* parseSseStream(res);
}

/**
 * Stream platform import with SSE progress.
 */
export async function* streamPlatformImport(
  projectId: string,
  platformData: string,
  conversationIds?: string[]
): AsyncGenerator<ImportStreamEvent> {
  const res = await fetch(`${API_V1}/import/platform/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      platform_data: platformData,
      conversation_ids: conversationIds,
    }),
  });

  if (!res.ok) await throwStreamError(res);

  yield* parseSseStream(res);
}
