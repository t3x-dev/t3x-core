/**
 * Core API client for contextflow-webui
 *
 * Connects to contextflow-core FastAPI backend.
 * All data is shared with CLI through the same SQLite database.
 */

const BASE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8000'
const API_V1 = `${BASE_URL}/api/v1`
const DEFAULT_TIMEOUT = 10000

// ============================================================================
// Types (aligned with core_api/schemas.py)
// ============================================================================

export interface Project {
  project_id: string
  name: string
  created_at: string
  conversations_count?: number
  turns_count?: number
  metadata?: Record<string, unknown>
}

export interface ProjectDetail extends Project {
  stats?: {
    conversations_count: number
    turns_count: number
    commits_count: number
  }
}

export interface Conversation {
  conversation_id: string
  project_id: string
  title?: string
  created_at: string
  turns_count?: number
}

export interface Turn {
  turn_hash: string
  project_id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  parent_turn_hash?: string
  language?: string
  created_at: string
}

export interface TurnDetail extends Turn {
  rings: {
    ring1: {
      keywords: string[]
      entities: Array<{ text: string; type: string }>
      time_anchor?: string
      preference_keywords: Array<{ keyword: string; polarity: string; lemma: string }>
    }
    ring2: {
      intent_seed?: string
      time_window?: string
      preference_soft: string[]
      unknown_slot: string[]
      facets: string[]
    }
    ring3: {
      segments: Array<{ id: string; text: string }>
    }
  }
}

export interface Branch {
  branch_id: string
  name: string
  project_id?: string
  parent_branch?: string
  head_commit_hash?: string
  description?: string
  is_current: boolean
  created_at: string
  updated_at: string
}

export interface Commit {
  commit_hash: string
  project_id: string
  branch: string
  message?: string
  parent_hashes: string[]
  created_at: string
}

export interface CommitDetail extends Commit {
  turn_window: {
    start_turn_hash: string
    end_turn_hash: string
  }
  facet_snapshot: Array<{
    facet: string
    text: string
    keywords: string[]
    evidence: Array<{
      turn_hash: string
      segment_id: string
      similarity_score: number
    }>
  }>
  draft_ref?: {
    draft_id: string
    text_hash: string
  }
  signature?: {
    algo: string
    key_id: string
    value: string
  }
}

export interface Draft {
  draft_id: string
  project_id: string
  conversation_id: string
  status: 'pending' | 'ready' | 'failed'
  base_commit_hash?: string
  turn_anchor_hash?: string
  bridge_id: string
  intent: string
  text?: string
  must_have: string[]
  mustnt_have: string[]
  validation?: {
    passed: boolean
    missing_keywords: string[]
    forbidden_keywords: string[]
  }
  created_at: string
  completed_at?: string
}

export interface DiffResult {
  base_commit_hash: string
  target_commit_hash: string
  diff: {
    facet_changes: Array<{
      facet: string
      change_type: 'added' | 'removed' | 'modified'
      base_text?: string
      target_text?: string
      added_keywords: string[]
      removed_keywords: string[]
    }>
    segment_changes: Array<{
      segment_id: string
      change_type: 'added' | 'removed' | 'modified'
      text: string
      similarity_to_base?: number
    }>
  }
  computed_at: string
}

export interface MergeResult {
  merge_result_id: string
  base_commit_hash: string
  source_commit_hash: string
  target_commit_hash: string
  status: 'clean' | 'conflicts'
  auto_merged_facets: Array<{
    facet: string
    merged_text: string
    source: 'source' | 'target'
    keywords: string[]
  }>
  conflicts: Array<{
    facet: string
    base_text?: string
    source_text?: string
    target_text?: string
    conflict_type: string
  }>
  auto_merged_count: number
  conflict_count: number
  created_at: string
}

export interface PaginatedResponse<T> {
  status: string
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export interface ApiResponse<T> {
  status: string
  data: T
}

// ============================================================================
// Error handling
// ============================================================================

export class ApiError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(
      errorData.error?.code || 'UNKNOWN_ERROR',
      errorData.error?.message || `HTTP ${response.status}`,
      errorData.error?.details
    )
  }
  return response.json()
}

// Fetch with timeout wrapper
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// Helper to build query string with proper encoding
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }
  return searchParams.toString()
}

// ============================================================================
// Health & Status
// ============================================================================

export async function checkHealth(): Promise<{ status: string; version: string; uptime: number }> {
  const res = await fetchWithTimeout(`${BASE_URL}/health`, undefined, 5000)
  return handleResponse(res)
}

export async function getStatus(): Promise<{
  projects_count: number
  conversations_count: number
  turns_count: number
  commits_count: number
}> {
  const res = await fetchWithTimeout(`${API_V1}/status`)
  const data = await handleResponse<ApiResponse<{
    projects_count: number
    conversations_count: number
    turns_count: number
    commits_count: number
  }>>(res)
  return data.data
}

// ============================================================================
// Projects
// ============================================================================

export async function listProjects(limit = 50, offset = 0): Promise<PaginatedResponse<Project>> {
  const query = buildQueryString({ limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/projects?${query}`)
  return handleResponse(res)
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`)
  const data = await handleResponse<ApiResponse<ProjectDetail>>(res)
  return data.data
}

export async function createProject(name: string, metadata?: Record<string, unknown>): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata }),
  })
  const data = await handleResponse<ApiResponse<Project>>(res)
  return data.data
}

export interface DeleteProjectResponse {
  deleted: string
  name: string
  cascade_deleted: {
    turns: number
    drafts: number
    conversations: number
    commits: number
    branches: number
    merge_results: number
  }
}

export async function deleteProject(projectId: string): Promise<DeleteProjectResponse> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
  const data = await handleResponse<ApiResponse<DeleteProjectResponse>>(res)
  return data.data
}

// ============================================================================
// Conversations
// ============================================================================

export async function listConversations(
  projectId: string,
  limit = 50,
  offset = 0
): Promise<PaginatedResponse<Conversation>> {
  const query = buildQueryString({ project_id: projectId, limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/conversations?${query}`)
  return handleResponse(res)
}

export async function createConversation(
  projectId: string,
  title?: string,
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  const res = await fetchWithTimeout(`${API_V1}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, title, metadata }),
  })
  const data = await handleResponse<ApiResponse<Conversation>>(res)
  return data.data
}

// ============================================================================
// Turns
// ============================================================================

export async function listTurns(
  projectId: string,
  conversationId?: string,
  limit = 100,
  offset = 0
): Promise<PaginatedResponse<Turn>> {
  const query = buildQueryString({
    project_id: projectId,
    conversation_id: conversationId,
    limit,
    offset,
  })
  const res = await fetchWithTimeout(`${API_V1}/turns?${query}`)
  return handleResponse(res)
}

export async function getTurn(turnHash: string): Promise<TurnDetail> {
  const res = await fetchWithTimeout(`${API_V1}/turns/${encodeURIComponent(turnHash)}`)
  const data = await handleResponse<ApiResponse<TurnDetail>>(res)
  return data.data
}

export async function createTurn(
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  language?: 'zh' | 'en' | 'auto'
): Promise<Turn> {
  const res = await fetchWithTimeout(`${API_V1}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      conversation_id: conversationId,
      role,
      content,
      language,
    }),
  })
  const data = await handleResponse<ApiResponse<Turn>>(res)
  return data.data
}

// ============================================================================
// Branches
// ============================================================================

export async function listBranches(projectId: string): Promise<PaginatedResponse<Branch>> {
  const query = buildQueryString({ project_id: projectId })
  const res = await fetchWithTimeout(`${API_V1}/branches?${query}`)
  return handleResponse(res)
}

export async function getCurrentBranch(projectId: string): Promise<{
  project_id: string
  current_branch: string
  head_commit_hash?: string
}> {
  const query = buildQueryString({ project_id: projectId })
  const res = await fetchWithTimeout(`${API_V1}/branches/current?${query}`)
  const data = await handleResponse<ApiResponse<{
    project_id: string
    current_branch: string
    head_commit_hash?: string
  }>>(res)
  return data.data
}

export async function createBranch(
  projectId: string,
  name: string,
  fromBranch?: string,
  description?: string,
  checkout = false
): Promise<Branch> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name,
      from_branch: fromBranch,
      description,
      checkout,
    }),
  })
  const data = await handleResponse<ApiResponse<Branch>>(res)
  return data.data
}

export async function switchBranch(
  projectId: string,
  name: string,
  create = false,
  fromBranch?: string
): Promise<Branch> {
  const res = await fetchWithTimeout(`${API_V1}/branches/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name,
      create,
      from_branch: fromBranch,
    }),
  })
  const data = await handleResponse<ApiResponse<Branch>>(res)
  return data.data
}

export async function deleteBranch(projectId: string, name: string, force = false): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, name, force }),
  })
  await handleResponse(res)
}

// ============================================================================
// Commits
// ============================================================================

export async function listCommits(
  projectId: string,
  branch?: string,
  limit = 50,
  offset = 0
): Promise<PaginatedResponse<Commit>> {
  const query = buildQueryString({ project_id: projectId, branch, limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/commits?${query}`)
  return handleResponse(res)
}

export async function getCommit(commitHash: string): Promise<CommitDetail> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(commitHash)}`)
  const data = await handleResponse<ApiResponse<CommitDetail>>(res)
  return data.data
}

export async function createCommit(
  projectId: string,
  conversationId: string,
  turnWindow: { start_turn_hash: string; end_turn_hash: string },
  branch = 'main',
  message?: string,
  draftId?: string,
  sign = false
): Promise<Commit> {
  const res = await fetchWithTimeout(`${API_V1}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      conversation_id: conversationId,
      branch,
      message,
      turn_window: turnWindow,
      draft_id: draftId,
      sign,
    }),
  })
  const data = await handleResponse<ApiResponse<Commit>>(res)
  return data.data
}

// ============================================================================
// Diff & Merge
// ============================================================================

export async function diff(baseCommitHash: string, targetCommitHash: string): Promise<DiffResult> {
  const res = await fetchWithTimeout(`${API_V1}/diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_commit_hash: baseCommitHash,
      target_commit_hash: targetCommitHash,
    }),
  })
  const data = await handleResponse<ApiResponse<DiffResult>>(res)
  return data.data
}

export async function merge(
  projectId: string,
  baseCommitHash: string,
  sourceCommitHash: string,
  targetCommitHash: string
): Promise<MergeResult> {
  const res = await fetchWithTimeout(`${API_V1}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      base_commit_hash: baseCommitHash,
      source_commit_hash: sourceCommitHash,
      target_commit_hash: targetCommitHash,
    }),
  })
  const data = await handleResponse<ApiResponse<MergeResult>>(res)
  return data.data
}

// ============================================================================
// Drafts (Agent Layer)
// ============================================================================

export async function createDraft(
  projectId: string,
  conversationId: string,
  bridgeId: 'plan' | 'summary' | 'explain' | 'clarify',
  intent: string,
  baseCommitHash?: string,
  turnAnchorHash?: string
): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      conversation_id: conversationId,
      bridge_id: bridgeId,
      intent,
      base_commit_hash: baseCommitHash,
      turn_anchor_hash: turnAnchorHash,
    }),
  })
  const data = await handleResponse<ApiResponse<Draft>>(res)
  return data.data
}

export async function getDraft(draftId: string): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts/${encodeURIComponent(draftId)}`)
  const data = await handleResponse<ApiResponse<Draft>>(res)
  return data.data
}

export async function updateDraft(
  draftId: string,
  feedback?: string,
  appendMustHave?: string[]
): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feedback,
      append_must_have: appendMustHave,
    }),
  })
  const data = await handleResponse<ApiResponse<Draft>>(res)
  return data.data
}

// ============================================================================
// Export
// ============================================================================

export async function exportCfpack(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId })
  const res = await fetchWithTimeout(`${API_V1}/export/cfpack?${query}`, undefined, 30000)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    )
  }
  return res.blob()
}

export async function exportLedger(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId })
  const res = await fetchWithTimeout(`${API_V1}/export/ledger?${query}`, undefined, 30000)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    )
  }
  return res.blob()
}
