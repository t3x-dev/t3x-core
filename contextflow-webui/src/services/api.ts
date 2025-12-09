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

// Raw commit from API - contains JSON strings that need parsing
export interface CommitRaw {
  commit_hash: string
  project_id: string
  branch: string
  message: string | null
  parents_json: string
  turn_window_json: string | null
  facet_snapshot_json: string | null
  draft_ref_json: string | null
  signature_json: string | null
  source_excerpt_json: string | null
  must_have_json: string | null
  mustnt_have_json: string | null
  created_at: string
}

// Facet types from CLI aggregateFacets
// Base fields that all facets have
export interface FacetBase {
  facet: string
  confidence?: number
  source_turn?: string
  // Additional fields from CLI FacetRecord
  key?: string
  value?: unknown
  text?: string
  entity_type?: string
}

export interface GoalFacet extends FacetBase {
  facet: 'goal'
  text: string
}

export interface PreferenceFacet extends FacetBase {
  facet: 'preference'
  key: string
  value: string
}

export interface ContextFacet extends FacetBase {
  facet: 'context'
  entity_type: string
  text: string
}

// Union type for all facet kinds, plus catch-all for unknown facet types
export type Facet = GoalFacet | PreferenceFacet | ContextFacet | FacetBase

// Parsed commit for frontend use
export interface Commit {
  commit_hash: string
  project_id: string
  branch: string
  message: string | null
  parent_hashes: string[]
  turn_window: {
    start_turn_hash: string
    end_turn_hash: string
  } | null
  facet_snapshot: Facet[] | null
  draft_ref: {
    draft_id: string
    text_hash: string
  } | null
  signature: {
    algo: string
    key_id: string
    value: string
  } | null
  source_excerpt: string[] | null
  must_have: string[] | null
  mustnt_have: string[] | null
  created_at: string
}

// CommitDetail is now same as Commit since we parse all JSON fields
export type CommitDetail = Commit

export interface Draft {
  draft_id: string
  project_id: string
  conversation_id: string
  lifecycle_status: 'ephemeral' | 'adopted' | 'superseded'
  validation_status: 'pending' | 'passed' | 'failed'
  base_commit_hash: string | null
  turn_anchor_hash: string | null
  bridge_id: string
  intent: string
  text: string | null
  must_have: string[]
  mustnt_have: string[]
  validation: {
    passed: boolean
    missing_keywords: string[]
    forbidden_keywords: string[]
  } | null
  llm_config: unknown
  created_at: string
  completed_at: string | null
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

// List response types - CLI returns nested structure: { status, data: { items: [...], limit, offset } }
export interface ProjectListData {
  projects: Project[]
  limit: number
  offset: number
}

export interface ConversationListData {
  conversations: Conversation[]
  limit: number
  offset: number
}

export interface TurnListData {
  turns: Turn[]
  limit: number
  offset: number
}

// Internal: API returns raw JSON strings
interface CommitListDataRaw {
  commits: CommitRaw[]
  limit: number
  offset: number
}

export interface CommitListData {
  commits: Commit[]
  limit: number
  offset: number
}

export interface BranchListData {
  branches: Branch[]
  limit: number
  offset: number
}

export interface ApiResponse<T> {
  status: string
  data: T
}

// ============================================================================
// JSON Parsing Helpers
// ============================================================================

/**
 * Parse raw commit from API (with JSON string fields) into frontend Commit type
 */
function parseCommit(raw: CommitRaw): Commit {
  return {
    commit_hash: raw.commit_hash,
    project_id: raw.project_id,
    branch: raw.branch,
    message: raw.message,
    parent_hashes: raw.parents_json ? JSON.parse(raw.parents_json) : [],
    turn_window: raw.turn_window_json ? JSON.parse(raw.turn_window_json) : null,
    facet_snapshot: raw.facet_snapshot_json ? JSON.parse(raw.facet_snapshot_json) : null,
    draft_ref: raw.draft_ref_json ? JSON.parse(raw.draft_ref_json) : null,
    signature: raw.signature_json ? JSON.parse(raw.signature_json) : null,
    source_excerpt: raw.source_excerpt_json ? JSON.parse(raw.source_excerpt_json) : null,
    must_have: raw.must_have_json ? JSON.parse(raw.must_have_json) : null,
    mustnt_have: raw.mustnt_have_json ? JSON.parse(raw.mustnt_have_json) : null,
    created_at: raw.created_at,
  }
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
// Supports external AbortSignal for cancellation (e.g., component unmount)
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  // Link external signal to our controller
  const abortHandler = () => controller.abort()
  externalSignal?.addEventListener('abort', abortHandler)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Check if it was external abort vs timeout
      if (externalSignal?.aborted) {
        throw new ApiError('ABORTED', 'Request was cancelled')
      }
      throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortHandler)
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

export async function listProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  const query = buildQueryString({ limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/projects?${query}`)
  const response = await handleResponse<ApiResponse<ProjectListData>>(res)
  return response.data
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
  deleted: boolean
  project_id: string
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
): Promise<ConversationListData> {
  const query = buildQueryString({ project_id: projectId, limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/conversations?${query}`)
  const response = await handleResponse<ApiResponse<ConversationListData>>(res)
  return response.data
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
  conversationId: string,
  limit = 100,
  offset = 0,
  options?: {
    signal?: AbortSignal
    /** Sort order: 'asc' (oldest first) or 'desc' (newest first). Default: 'asc' */
    order?: 'asc' | 'desc'
  }
): Promise<TurnListData> {
  const query = buildQueryString({
    project_id: projectId,
    conversation_id: conversationId,
    limit,
    offset,
    order: options?.order,
  })
  const res = await fetchWithTimeout(`${API_V1}/turns?${query}`, undefined, DEFAULT_TIMEOUT, options?.signal)
  const response = await handleResponse<ApiResponse<TurnListData>>(res)
  return response.data
}

export async function getTurn(turnHash: string): Promise<TurnDetail> {
  // Don't encode the colon in sha256:xxx - backend expects raw format
  const res = await fetchWithTimeout(`${API_V1}/turns/${turnHash}`)
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

export async function listBranches(projectId: string): Promise<BranchListData> {
  const query = buildQueryString({ project_id: projectId })
  const res = await fetchWithTimeout(`${API_V1}/branches?${query}`)
  const response = await handleResponse<ApiResponse<BranchListData>>(res)
  return response.data
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
): Promise<CommitListData> {
  const query = buildQueryString({ project_id: projectId, branch, limit, offset })
  const res = await fetchWithTimeout(`${API_V1}/commits?${query}`)
  const response = await handleResponse<ApiResponse<CommitListDataRaw>>(res)
  return {
    commits: response.data.commits.map(parseCommit),
    limit: response.data.limit,
    offset: response.data.offset,
  }
}

export async function getCommit(commitHash: string): Promise<Commit> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(commitHash)}`)
  const data = await handleResponse<ApiResponse<CommitRaw>>(res)
  return parseCommit(data.data)
}

export async function createCommit(
  projectId: string,
  turnWindow: { start_turn_hash: string; end_turn_hash: string },
  branch = 'main',
  message?: string,
  options?: {
    draftId?: string
    sourceExcerpt?: string[]
    mustHave?: string[]
    mustntHave?: string[]
  }
): Promise<Commit> {
  const res = await fetchWithTimeout(`${API_V1}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      branch,
      message,
      turn_window: turnWindow,
      draft_id: options?.draftId,
      source_excerpt: options?.sourceExcerpt,
      must_have: options?.mustHave,
      mustnt_have: options?.mustntHave,
    }),
  })
  const data = await handleResponse<ApiResponse<CommitRaw>>(res)
  return parseCommit(data.data)
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

// ============================================================================
// Chat (LLM Integration)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  provider?: string
  model?: string
  temperature?: number
  max_tokens?: number
}

export interface ChatResponse {
  content: string
  model: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  finish_reason?: string
}

export interface ChatStreamEvent {
  type: 'token' | 'done' | 'error'
  content?: string
  model?: string
  message?: string
}

export interface ChatProvidersResponse {
  providers: string[]
  default: string
}

/**
 * Get available chat providers
 */
export async function getChatProviders(): Promise<ChatProvidersResponse> {
  const res = await fetchWithTimeout(`${API_V1}/chat/providers`)
  const data = await handleResponse<ApiResponse<ChatProvidersResponse>>(res)
  return data.data
}

/**
 * Non-streaming chat
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetchWithTimeout(`${API_V1}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, 120000) // 2 minute timeout for LLM
  const data = await handleResponse<ApiResponse<ChatResponse>>(res)
  return data.data
}

/**
 * Streaming chat - returns async generator for SSE events
 */
export async function* chatStream(
  request: ChatRequest
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const res = await fetch(`${API_V1}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new ApiError(
      errorData.error?.code || 'CHAT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    )
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new ApiError('CHAT_ERROR', 'No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events: data: {...}\n\n
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const dataStr = trimmed.slice(5).trim()
        if (dataStr === '[DONE]') continue

        try {
          const event = JSON.parse(dataStr) as ChatStreamEvent
          yield event
        } catch {
          // Ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
