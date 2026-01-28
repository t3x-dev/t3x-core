/**
 * API client for t3x-webui
 *
 * Calls the standalone T3X API server.
 * Falls back to embedded Next.js API routes if standalone API is not configured.
 */

// Import types for CommitAnchors conversion (must be at top level)
import type {
  CommitAnchors,
  SentenceWithAnchors,
  ConfirmedAnchor,
  AnchorType,
  AnchorConstraint,
} from '@/types/nodes';
import type { Pin } from '@t3x/core';

// Use standalone API if configured, otherwise fall back to embedded routes
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_V1 = `${API_BASE}/api/v1`;
const DEFAULT_TIMEOUT = 10000;

// ============================================================================
// Types (aligned with @t3x/storage schema)
// ============================================================================

export interface Project {
  project_id: string;
  name: string;
  created_at: string;
  conversations_count?: number;
  turns_count?: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectDetail extends Project {
  stats?: {
    conversations_count: number;
    turns_count: number;
    commits_count: number;
  };
}

export interface Conversation {
  conversation_id: string;
  project_id: string;
  title?: string;
  parent_commit_hash?: string;
  position_x?: number;
  position_y?: number;
  created_at: string;
  turns_count?: number;
}

export interface Turn {
  turn_hash: string;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parent_turn_hash?: string;
  language?: string;
  created_at: string;
}

// Keyword from Ring 1 - aligned with @t3x/core Keyword
export interface RingKeyword {
  text: string;
  lemma: string;
  polarity: -1 | 0 | 1;
  pos: string;
  entityType: string | null;
  confidence: number;
}

// Facet from Ring 2 - aligned with @t3x/core Facet
export interface RingFacet {
  facetType: 'intent_seed' | 'time_window' | 'preference_soft' | 'unknown_slot';
  key: string;
  value: unknown;
  confidence: number;
}

// Segment from Ring 3 - aligned with @t3x/core Segment
export interface RingSegment {
  segmentId: string;
  text: string;
  startChar: number;
  endChar: number;
}

// Anchor candidate from Ring 1 (camelCase for internal use)
export interface RingAnchorCandidate {
  text: string;
  type: 'number' | 'money' | 'duration' | 'percent' | 'date' | 'entity' | 'term' | 'phrase';
  startChar: number;
  endChar: number;
  confidence: number;
  source: 'token' | 'entity' | 'phrase';
}

// Ring output structure - aligned with @t3x/core RingOutput
export interface RingsData {
  ring1: {
    keywords: RingKeyword[];
    timeAnchor: string | null;
    topic: string | null;
    preferenceKeywords: RingKeyword[];
    /** v1.1: Anchor candidates for inline highlighting */
    anchorCandidates?: RingAnchorCandidate[];
  };
  ring2: {
    facets: RingFacet[];
  };
  ring3: {
    segments: RingSegment[];
  };
}

export interface TurnDetail extends Turn {
  // API returns { rings: { ring1, ring2, ring3 } } wrapper
  rings: { rings: RingsData } | RingsData | null;
}

export interface Branch {
  branch_id: string;
  name: string;
  project_id?: string;
  parent_branch?: string;
  head_commit_hash?: string;
  description?: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

// Facet types from CLI aggregateFacets
// Base fields that all facets have
export interface FacetBase {
  facet: string;
  confidence?: number;
  source_turn?: string;
  // Additional fields from CLI FacetRecord
  key?: string;
  value?: unknown;
  text?: string;
  entity_type?: string;
}

export interface GoalFacet extends FacetBase {
  facet: 'goal';
  text: string;
}

export interface PreferenceFacet extends FacetBase {
  facet: 'preference';
  key: string;
  value: string;
}

export interface ContextFacet extends FacetBase {
  facet: 'context';
  entity_type: string;
  text: string;
}

// Union type for all facet kinds, plus catch-all for unknown facet types
export type Facet = GoalFacet | PreferenceFacet | ContextFacet | FacetBase;

// Source reference for multi-source commits
export interface SourceRef {
  type: 'conversation' | 'commit';
  conversation_id?: string;
  turn_window?: {
    start_turn_hash: string;
    end_turn_hash: string;
  };
  commit_hash?: string;
}

// ============================================================================
// Anchor Types for Commits (snake_case API format)
// ============================================================================

/** Anchor constraint type (snake_case to match API v1.1 output) */
export type ApiAnchorConstraint = 'must_have' | 'mustnt_have' | 'preferred';

/** Anchor type */
export type ApiAnchorType = 'number' | 'money' | 'duration' | 'percent' | 'date' | 'entity' | 'term' | 'phrase';

/** Confirmed anchor (snake_case API format) */
export interface ApiConfirmedAnchor {
  id: string;
  text: string;
  /** Relative position within sentence (for API storage) */
  start: number;
  /** Relative position within sentence (for API storage) */
  end: number;
  type: ApiAnchorType;
  constraint: ApiAnchorConstraint;
  /** Optional: Pre-computed global start position (NOT from API, computed in UI layer during parsing) */
  global_start?: number;
  /** Optional: Pre-computed global end position (NOT from API, computed in UI layer during parsing) */
  global_end?: number;
}

/** Sentence with anchors (snake_case API format) */
export interface ApiSentenceWithAnchors {
  sentence_id: string;
  text: string;
  start_char: number;
  end_char: number;
  anchors: ApiConfirmedAnchor[];
}

/** Commit-level anchor storage (snake_case API format) */
export interface ApiCommitAnchors {
  input_text_hash: string;
  sentences: ApiSentenceWithAnchors[];
}

// Parsed commit for frontend use
// Aligned with @t3x/core CommitV2Record
export interface Commit {
  commit_hash: string;
  project_id: string;
  branch: string;
  message: string | null;
  parent_hashes: string[];
  turn_window: {
    start_turn_hash: string;
    end_turn_hash: string;
  } | null;
  facet_snapshot: Facet[] | null;
  pipeline_config: unknown | null;
  draft_id: string | null;
  draft_text_hash: string | null;
  signature: {
    algo: string;
    key_id: string;
    value: string;
  } | null;
  source_excerpt: string[] | null;
  must_have: string[] | null;
  mustnt_have: string[] | null;
  position_x: number | null;
  position_y: number | null;
  source_refs: SourceRef[] | null;
  /** v1.1: Confirmed anchors for this commit */
  anchors: ApiCommitAnchors | null;
  created_at: string;
}

// CommitDetail is now same as Commit since we parse all JSON fields
export type CommitDetail = Commit;

export interface Draft {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  lifecycle_status: 'ephemeral' | 'adopted' | 'superseded';
  validation_status: 'pending' | 'passed' | 'failed';
  base_commit_hash: string | null;
  turn_anchor_hash: string | null;
  bridge_id: string;
  intent: string;
  text: string | null;
  must_have: string[];
  mustnt_have: string[];
  validation: {
    passed: boolean;
    missing_keywords: string[];
    forbidden_keywords: string[];
  } | null;
  llm_config: unknown;
  created_at: string;
  completed_at: string | null;
}

// Raw diff response from backend
interface DiffResultRaw {
  baseId: string;
  targetId: string;
  segmentDiffs: Array<{
    segmentId: string;
    text: string;
    diffType: 'same' | 'added' | 'removed' | 'modified';
    matchedSegmentId?: string;
    similarity?: number;
  }>;
  threshold: number;
  stats: {
    totalSegments: number;
    sameCount: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    conflictCount: number;
  };
  method: string;
  usedCache: boolean;
}

// Transformed diff result for UI
export interface DiffResult {
  base_commit_hash: string;
  target_commit_hash: string;
  diff: {
    facet_changes: Array<{
      facet: string;
      change_type: 'added' | 'removed' | 'modified';
      base_text?: string;
      target_text?: string;
      added_keywords: string[];
      removed_keywords: string[];
    }>;
    segment_changes: Array<{
      segment_id: string;
      change_type: 'added' | 'removed' | 'modified' | 'same';
      text: string;
      similarity_to_base?: number;
    }>;
  };
  computed_at: string;
  stats?: DiffResultRaw['stats'];
}

// List response types - CLI returns nested structure: { status, data: { items: [...], limit, offset } }
export interface ProjectListData {
  projects: Project[];
  limit: number;
  offset: number;
}

export interface ConversationListData {
  conversations: Conversation[];
  limit: number;
  offset: number;
}

export interface TurnListData {
  turns: Turn[];
  limit: number;
  offset: number;
}

export interface BranchListData {
  branches: Branch[];
  limit: number;
  offset: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// JSON Parsing Helpers
// ============================================================================

/**
 * Safely parse JSON string, returning fallback on error
 */
function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn('Failed to parse JSON:', json.slice(0, 100));
    return fallback;
  }
}

/**
 * Parse rings data from API response
 * API returns { rings: { ring1, ring2, ring3 } } or directly { ring1, ring2, ring3 }
 */
export function parseRingsData(rings: TurnDetail['rings']): RingsData | null {
  if (!rings) return null;

  // Check if it's wrapped in { rings: ... }
  if ('rings' in rings && rings.rings) {
    return rings.rings as RingsData;
  }

  // Direct format
  if ('ring1' in rings) {
    return rings as RingsData;
  }

  return null;
}

/**
 * Parse CommitAnchors from JSON and pre-compute global positions for UI rendering.
 *
 * The API stores anchor positions relative to their sentence (start/end).
 * For UI rendering, we need global positions (relative to the full source text).
 * This function adds global_start/global_end (snake_case) to each anchor.
 * These are later converted to camelCase (globalStart/globalEnd) by parseApiConfirmedAnchor.
 *
 * Graceful degradation: Returns null if data is corrupt (logs warning).
 * This prevents a single corrupt commit from breaking the entire canvas.
 */
function parseAnchorsWithGlobalPositions(json: string | null): ApiCommitAnchors | null {
  if (!json) return null;

  try {
    const anchors = JSON.parse(json) as ApiCommitAnchors;
    if (!anchors?.sentences) return anchors;

    // Pre-compute global positions for each anchor
    for (let i = 0; i < anchors.sentences.length; i++) {
      const sentence = anchors.sentences[i];

      // Graceful degradation: if start_char is missing, warn and return null
      // This prevents a single corrupt commit from breaking the entire canvas
      if (typeof sentence.start_char !== 'number') {
        console.warn(
          `[api] Anchor data corrupt: sentence[${i}].start_char is missing (got ${typeof sentence.start_char}). ` +
            `Cannot compute global anchor positions. Anchor highlighting disabled for this commit.`
        );
        return null;
      }

      const sentenceStart = sentence.start_char;
      for (const anchor of sentence.anchors ?? []) {
        // Add global positions for UI rendering (snake_case for API type consistency)
        anchor.global_start = sentenceStart + anchor.start;
        anchor.global_end = sentenceStart + anchor.end;
      }
    }

    return anchors;
  } catch (err) {
    console.warn('[api] Failed to parse anchors_json:', json?.slice(0, 100), err);
    return null;
  }
}

// ============================================================================
// Error handling
// ============================================================================

export class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
  }))) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    throw new ApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || `HTTP ${response.status}`,
      (json.error as { details?: Record<string, unknown> })?.details
    );
  }
  return json.data as T;
}

// Fetch with timeout wrapper
// Supports external AbortSignal for cancellation (e.g., component unmount)
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal to our controller
  const abortHandler = () => controller.abort();
  externalSignal?.addEventListener('abort', abortHandler);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Check if it was external abort vs timeout
      if (externalSignal?.aborted) {
        throw new ApiError('ABORTED', 'Request was cancelled');
      }
      throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);
  }
}

// Helper to build query string with proper encoding
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  return searchParams.toString();
}

// ============================================================================
// Health & Status
// ============================================================================

export async function checkHealth(): Promise<{ status: string; version: string; uptime: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/health`, undefined, 5000);
  return handleResponse(res);
}

export async function getStatus(): Promise<{
  projects_count: number;
  conversations_count: number;
  turns_count: number;
  commits_count: number;
}> {
  const res = await fetchWithTimeout(`${API_V1}/status`);
  return handleResponse<{
    projects_count: number;
    conversations_count: number;
    turns_count: number;
    commits_count: number;
  }>(res);
}

// ============================================================================
// Projects
// ============================================================================

export async function listProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  const query = buildQueryString({ limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/projects?${query}`);
  return handleResponse<ProjectListData>(res);
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`);
  return handleResponse<ProjectDetail>(res);
}

export async function createProject(
  name: string,
  metadata?: Record<string, unknown>
): Promise<Project> {
  const res = await fetchWithTimeout(`${API_V1}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata }),
  });
  return handleResponse<Project>(res);
}

export interface DeleteProjectResponse {
  deleted: boolean;
  project_id: string;
}

export async function deleteProject(projectId: string): Promise<DeleteProjectResponse> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return handleResponse<DeleteProjectResponse>(res);
}

// ============================================================================
// Conversations
// ============================================================================

export async function listConversations(
  projectId: string,
  limit = 50,
  offset = 0
): Promise<ConversationListData> {
  const query = buildQueryString({ project_id: projectId, limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/conversations?${query}`);
  return handleResponse<ConversationListData>(res);
}

export async function createConversation(
  projectId: string,
  title?: string,
  parentCommitHash?: string,
  position?: { x: number; y: number },
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  const res = await fetchWithTimeout(`${API_V1}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      title,
      parent_commit_hash: parentCommitHash,
      position_x: position?.x,
      position_y: position?.y,
      metadata,
    }),
  });
  return handleResponse<Conversation>(res);
}

export async function deleteConversation(
  conversationId: string
): Promise<{ deleted: boolean; conversation_id: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<{ deleted: boolean; conversation_id: string }>(res);
}

export async function getConversation(
  conversationId: string
): Promise<Conversation & { turns_count?: number }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`
  );
  return handleResponse<Conversation & { turns_count?: number }>(res);
}

export async function updateConversation(
  conversationId: string,
  updates: { title?: string; position_x?: number; position_y?: number }
): Promise<Conversation> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return handleResponse<Conversation>(res);
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
    signal?: AbortSignal;
    /** Sort order: 'asc' (oldest first) or 'desc' (newest first). Default: 'asc' */
    order?: 'asc' | 'desc';
  }
): Promise<TurnListData> {
  const query = buildQueryString({
    project_id: projectId,
    conversation_id: conversationId,
    limit,
    offset,
    order: options?.order,
  });
  const res = await fetchWithTimeout(
    `${API_V1}/turns?${query}`,
    undefined,
    DEFAULT_TIMEOUT,
    options?.signal
  );
  return handleResponse<TurnListData>(res);
}

export async function getTurn(turnHash: string): Promise<TurnDetail> {
  // Validate turnHash to prevent /api/v1/turns/undefined errors
  if (!turnHash || turnHash === 'undefined') {
    throw new Error('getTurn: turnHash is required');
  }
  // Don't encode the colon in sha256:xxx - backend expects raw format
  const res = await fetchWithTimeout(`${API_V1}/turns/${turnHash}`);
  return handleResponse<TurnDetail>(res);
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
  });
  return handleResponse<Turn>(res);
}

// ============================================================================
// Branches
// ============================================================================

export async function listBranches(projectId: string): Promise<BranchListData> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/branches?${query}`);
  return handleResponse<BranchListData>(res);
}

export async function getCurrentBranch(projectId: string): Promise<{
  project_id: string;
  current_branch: string;
  head_commit_hash?: string;
}> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/branches/current?${query}`);
  return handleResponse<{
    project_id: string;
    current_branch: string;
    head_commit_hash?: string;
  }>(res);
}

export async function createBranch(
  projectId: string,
  name: string,
  parentBranch?: string,
  description?: string,
  checkout = false
): Promise<Branch> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name,
      parent_branch: parentBranch, // Fixed: was 'from_branch', backend expects 'parent_branch'
      description,
      checkout,
    }),
  });
  return handleResponse<Branch>(res);
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
  });
  return handleResponse<Branch>(res);
}

export async function deleteBranch(projectId: string, name: string, force = false): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/branches`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, name, force }),
  });
  await handleResponse(res);
}

// ============================================================================
// Commits V3 (Sentence-based commits)
// ============================================================================

// CommitV3 sentence from API
export interface CommitV3Sentence {
  id: string;
  text: string;
  source: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

// CommitV3 constraint from API
export interface CommitV3Constraint {
  type: 'require' | 'exclude';
  id: string;
  value: string;
  match: 'exact' | 'semantic';
  source_sentence_id?: string;
  suggested?: boolean;
  reason?: string;
}

// CommitV3 author from API
export interface CommitV3Author {
  name: string;
  identity?: string;
  verification?: 'none' | 'device' | 'verified';
}

// CommitV3 from API response
export interface CommitV3 {
  hash: string;
  schema: 'commit/v3';
  parents: string[];
  author: CommitV3Author;
  committed_at: string;
  content: {
    sentences: CommitV3Sentence[];
    constraints?: CommitV3Constraint[];
  };
  project_id: string | null;
  message: string | null;
  branch: string | null;
  position?: { x: number; y: number };
  created_at: string;
  updated_at: string;
}

export interface CommitV3ListData {
  commits: CommitV3[];
  project_id: string;
  branch?: string;
  limit: number;
  offset: number;
}

export async function listCommitsV3(
  projectId: string,
  branch?: string,
  limit = 50,
  offset = 0
): Promise<CommitV3ListData> {
  const query = buildQueryString({ project_id: projectId, branch, limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/commits-v3?${query}`);
  return handleResponse<CommitV3ListData>(res);
}

export async function getCommitV3(commitHash: string): Promise<CommitV3> {
  const res = await fetchWithTimeout(`${API_V1}/commits-v3/${commitHash}`);
  return handleResponse<CommitV3>(res);
}

/**
 * Create a V3 commit (sentence-based)
 *
 * V3 commits use sentences[] and constraints[] instead of V2's turn_window and facet_snapshot.
 * This is the format required by the merge API.
 */
export async function createCommitV3(
  projectId: string,
  content: {
    sentences: CommitV3Sentence[];
    constraints?: CommitV3Constraint[];
  },
  options?: {
    branch?: string;
    message?: string;
    parents?: string[];
    position?: { x: number; y: number };
    author?: CommitV3Author;
  }
): Promise<CommitV3> {
  const res = await fetchWithTimeout(`${API_V1}/commits-v3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content,
      branch: options?.branch ?? 'main',
      message: options?.message,
      parents: options?.parents ?? [],
      position_x: options?.position?.x,
      position_y: options?.position?.y,
      author: options?.author,
    }),
  });
  return handleResponse<CommitV3>(res);
}

// ============================================================================
// Diff & Merge
// ============================================================================

export async function diff(baseCommitHash: string, targetCommitHash: string): Promise<DiffResult> {
  const res = await fetchWithTimeout(`${API_V1}/diff/two-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_commit_hash: baseCommitHash,
      target_commit_hash: targetCommitHash,
    }),
  });
  const raw = await handleResponse<DiffResultRaw>(res);

  // Transform backend response to frontend format
  const segmentChanges = raw.segmentDiffs.map((seg) => ({
    segment_id: seg.segmentId,
    change_type: seg.diffType as 'added' | 'removed' | 'modified' | 'same',
    text: seg.text,
    similarity_to_base: seg.similarity,
  }));

  // Group segments by change type to create facet-like changes for display
  const addedSegments = segmentChanges.filter((s) => s.change_type === 'added');
  const removedSegments = segmentChanges.filter((s) => s.change_type === 'removed');
  const modifiedSegments = segmentChanges.filter((s) => s.change_type === 'modified');

  // Create facet_changes from segment diffs for UI display
  const facetChanges: DiffResult['diff']['facet_changes'] = [];

  // Add removed segments as facet changes
  removedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `removed_${idx + 1}`,
      change_type: 'removed',
      base_text: seg.text,
      target_text: undefined,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  // Add added segments as facet changes
  addedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `added_${idx + 1}`,
      change_type: 'added',
      base_text: undefined,
      target_text: seg.text,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  // Add modified segments as facet changes
  modifiedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `modified_${idx + 1}`,
      change_type: 'modified',
      base_text: seg.text,
      target_text: seg.text,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  return {
    base_commit_hash: baseCommitHash,
    target_commit_hash: targetCommitHash,
    diff: {
      facet_changes: facetChanges,
      segment_changes: segmentChanges,
    },
    computed_at: new Date().toISOString(),
    stats: raw.stats,
  };
}

// ============================================================================
// Drafts (Agent Layer)
// ============================================================================

export async function createDraft(
  projectId: string,
  conversationId: string,
  bridgeId: 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify',
  intent: string,
  baseCommitHash?: string,
  turnAnchorHash?: string,
  /** Optional: pre-selected text from curate preview. If provided, use this instead of full conversation. */
  selectedText?: string,
  /** Curate parameters for debugging/review */
  curateParams?: { cosine?: number; keepRatio?: number }
): Promise<Draft> {
  // LLM draft generation typically takes 10-20 seconds for a single call
  const res = await fetchWithTimeout(
    `${API_V1}/agent/drafts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        bridge_id: bridgeId,
        intent,
        base_commit_hash: baseCommitHash,
        turn_anchor_hash: turnAnchorHash,
        selected_text: selectedText,
        cosine: curateParams?.cosine,
        keep_ratio: curateParams?.keepRatio,
      }),
    },
    30000
  );
  return handleResponse<Draft>(res);
}

export async function getDraft(draftId: string): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts/${encodeURIComponent(draftId)}`);
  return handleResponse<Draft>(res);
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
  });
  return handleResponse<Draft>(res);
}

// ============================================================================
// Export
// ============================================================================

export async function exportCfpack(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/export/cfpack?${query}`, undefined, 30000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    );
  }
  return res.blob();
}

export async function exportLedger(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/export/ledger?${query}`, undefined, 30000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    );
  }
  return res.blob();
}

// ============================================================================
// Chat (LLM Integration)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  finish_reason?: string;
}

export interface ChatStreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  model?: string;
  message?: string;
}

export interface ChatProvidersResponse {
  providers: string[];
  default: string;
}

/**
 * Get available chat providers
 */
export async function getChatProviders(): Promise<ChatProvidersResponse> {
  const res = await fetchWithTimeout(`${API_V1}/chat/providers`);
  return handleResponse<ChatProvidersResponse>(res);
}

/**
 * Non-streaming chat
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    120000
  ); // 2 minute timeout for LLM
  return handleResponse<ChatResponse>(res);
}

/**
 * Streaming chat - returns async generator for SSE events
 */
// ============================================================================
// Deploy Agents API (Database-backed)
// Note: This is different from the "agent" layer (LLM draft generation)
// ============================================================================

// Deploy Agent stored in database
export interface DeployAgent {
  deploy_agent_id: string
  project_id: string | null
  name: string
  endpoint: string
  type: string
  auth: {
    type: 'bearer' | 'api_key'
    token: string
    header?: string
  } | null
  status: 'idle' | 'running' | 'error'
  last_run_id: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface DeployAgentListData {
  deploy_agents: DeployAgent[]
  limit: number
  offset: number
}

/**
 * List deploy agents from database
 */
export async function listDeployAgents(options?: {
  project_id?: string
  limit?: number
  offset?: number
}): Promise<DeployAgentListData> {
  const query = buildQueryString({
    project_id: options?.project_id,
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  })
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents?${query}`)
  return handleResponse<DeployAgentListData>(res)
}

/**
 * Get deploy agent by ID from database
 */
export async function getDeployAgent(deployAgentId: string): Promise<DeployAgent> {
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`)
  return handleResponse<DeployAgent>(res)
}

/**
 * Create deploy agent in database
 */
export async function createDeployAgent(input: {
  id: string
  name: string
  endpoint: string
  type?: 'http' | 'websocket' | 'grpc'
  project_id?: string
  auth?: {
    type: 'bearer' | 'api_key'
    token: string
    header?: string
  }
}): Promise<DeployAgent> {
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<DeployAgent>(res)
}

/**
 * Update deploy agent in database
 */
export async function updateDeployAgent(
  deployAgentId: string,
  updates: {
    name?: string
    endpoint?: string
    type?: 'http' | 'websocket' | 'grpc'
    auth?: {
      type: 'bearer' | 'api_key'
      token: string
      header?: string
    } | null
    status?: 'idle' | 'running' | 'error'
    last_run_id?: string
    last_run_at?: string
  }
): Promise<DeployAgent> {
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return handleResponse<DeployAgent>(res)
}

/**
 * Delete deploy agent from database
 */
export async function deleteDeployAgent(deployAgentId: string): Promise<{ deleted: boolean; deploy_agent_id: string }> {
  const res = await fetchWithTimeout(`${API_V1}/deploy-agents/${encodeURIComponent(deployAgentId)}`, {
    method: 'DELETE',
  })
  return handleResponse<{ deleted: boolean; deploy_agent_id: string }>(res)
}

// ============================================================================
// Runner API (t3x-runner)
// ============================================================================

const RUNNER_URL = process.env.NEXT_PUBLIC_RUNNER_API_URL || 'http://localhost:8080';

// Agent configuration
export interface AgentConfig {
  id: string;
  name: string;
  endpoint: string;
  type: 'http' | 'websocket' | 'subprocess';
  auth?: {
    type: 'none' | 'bearer' | 'api_key' | 'basic';
    token?: string;
    header?: string;
  };
  metadata?: Record<string, unknown>;
}

// Run trace
export interface RunTrace {
  run_id: string;
  agent_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  input: Record<string, unknown>;
  output?: unknown;
  events: Array<{
    id: string;
    timestamp: string;
    type: 'llm_call' | 'tool_call' | 'agent_input' | 'agent_output' | 'error';
    data: {
      input?: unknown;
      output?: unknown;
      model?: string;
      tool_name?: string;
      latency_ms?: number;
      error?: string;
    };
  }>;
  metrics?: {
    total_latency_ms?: number;
    llm_calls: number;
    tool_calls: number;
    tokens_used?: number;
  };
}

export interface RunAgentResult {
  run_id: string
  output?: unknown
  trace: RunTrace
  error?: {
    code: string
    message: string
  }
}

// Test step
export interface TestStep {
  id: string;
  name: string;
  type: 'contains' | 'not_contains' | 'regex' | 'json_path' | 'semantic' | 'custom';
  target: 'input' | 'output' | 'llm_call' | 'tool_call' | 'trace';
  assertion: {
    value?: string;
    pattern?: string;
    path?: string;
    threshold?: number;
    fn?: string;
  };
  severity: 'error' | 'warning' | 'info';
}

// Test result
export interface TestResult {
  step_id: string;
  step_name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message?: string;
  expected?: unknown;
  actual?: unknown;
  suggestion?: string;
}

// Eval response
export interface EvalResponse {
  run_id: string;
  passed: boolean;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  results: TestResult[];
  suggestions?: Array<{
    type: 'prompt_change' | 'config_change' | 'tool_fix' | 'other';
    description: string;
    confidence: number;
    diff?: string;
  }>;
  t3x_commit_id?: string;
}

/**
 * Check runner health
 */
export async function checkRunnerHealth(): Promise<{ status: string; service: string }> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/health`, undefined, 5000);
  return handleResponse(res);
}

/**
 * Register an agent with the runner
 */
export async function registerAgent(config: AgentConfig): Promise<{ agent_id: string }> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return handleResponse(res);
}

/**
 * Get agent configuration
 */
export async function getAgent(agentId: string): Promise<AgentConfig> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/agents/${encodeURIComponent(agentId)}`);
  return handleResponse(res);
}

/**
 * Run an agent
 */
export async function runAgent(
  agentId: string,
  input: Record<string, unknown>,
  config?: { timeout_ms?: number }
): Promise<RunAgentResult> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      input,
      config,
    }),
  }, config?.timeout_ms ?? 60000)

  const json = await res.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
  })) as ApiResponse<{ run_id: string; output?: unknown; trace: RunTrace }>

  if (res.ok && json.success) {
    return json.data as RunAgentResult
  }

  if (json.data?.run_id && json.data?.trace) {
    return {
      ...(json.data as { run_id: string; output?: unknown; trace: RunTrace }),
      error: json.error || { code: 'RUN_FAILED', message: `HTTP ${res.status}` },
    }
  }

  throw new ApiError(
    json.error?.code || 'RUN_FAILED',
    json.error?.message || `HTTP ${res.status}`
  )
}

/**
 * Get run trace
 */
export async function getRunTrace(runId: string): Promise<RunTrace> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/run/${encodeURIComponent(runId)}`);
  return handleResponse(res);
}

/**
 * List runs
 */
export async function listRuns(agentId?: string): Promise<{ runs: RunTrace[] }> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await fetchWithTimeout(`${RUNNER_URL}/runs${query}`);
  return handleResponse(res);
}

/**
 * Run evaluation
 */
export async function runEval(
  runId: string,
  testSteps: TestStep[],
  options?: { stop_on_first_failure?: boolean; generate_suggestions?: boolean }
): Promise<EvalResponse> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      run_id: runId,
      test_steps: testSteps,
      options,
    }),
  });
  return handleResponse(res);
}

/**
 * Run agent with auto-eval (webhook mode)
 */
export async function runAgentWithEval(
  agentId: string,
  input: Record<string, unknown>,
  testSteps: TestStep[]
): Promise<{
  run_id: string;
  output: unknown;
  trace: RunTrace;
  eval_result: EvalResponse | null;
}> {
  const res = await fetchWithTimeout(
    `${RUNNER_URL}/webhook/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        input,
        auto_eval: true,
        test_steps: testSteps,
      }),
    },
    120000
  ); // 2 minute timeout for run + eval
  return handleResponse(res);
}

// NOTE: createCommitFromEval was removed in Runner cleanup v0.2.0
// The /commit endpoint was deprecated as part of the unified RunRecord architecture.
// See RUNNER_CLEANUP_PLAN.md for details.

// ============================================================================
// Engine Run API (Engine → Runner → n8n flow)
// ============================================================================

// Run record from Engine
export interface EngineRun {
  run_id: string;
  project_id: string | null;
  runner_run_id: string | null;
  commit_ref: string | null;
  leaf: {
    id: string;
    type: 'deploy_agent' | 'eval';  // V4 LeafType
    content?: string;
  } | null;
  inputs: Record<string, unknown> | null;
  workflow: {
    type: string;
    webhook_id?: string;
  } | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: {
    run_report?: Record<string, unknown>;
    assertions?: unknown[];
    evidence_pack?: Record<string, unknown>;
    // Add trace_summary to result for backwards compatibility
    trace_summary?: {
      trajectory?: {
        total_steps: number;
        llm_calls: number;
        tool_calls: number;
        retrieval_calls: number;
        failed_steps: number;
      };
      tokens?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      latency_ms?: number;
    };
  } | null;
  // v2.1: Metadata for A/B test filtering
  metadata: {
    model?: string;
    prompt_version?: string;
    workflow_id?: string;
    test_case?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEngineRunInput {
  project_id?: string;
  commit_ref?: string;
  leaf?: {
    id: string;
    type: 'deploy_agent' | 'eval';  // V4 LeafType (runner-related types only)
    content?: string;
    rules_ref?: string;  // 规则文件引用名（指向 Runner 的 resources/rules/ 目录）
  };
  inputs?: Record<string, unknown>;
  workflow?: {
    type: string;
    webhook_id?: string;
  };
  // v2.1: Metadata for A/B test filtering
  metadata?: {
    model?: string;
    prompt_version?: string;
    workflow_id?: string;
    test_case?: string;
  };
}

export interface EngineRunListData {
  runs: EngineRun[];
  limit: number;
  offset: number;
}

/**
 * Create a run via Engine (triggers Runner → n8n flow)
 */
export async function createEngineRun(input: CreateEngineRunInput): Promise<{
  run_id: string;
  status: string;
  runner_run_id?: string;
  warning?: string;
}> {
  const res = await fetchWithTimeout(`${API_V1}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  // handleResponse already extracts .data from ApiResponse
  return handleResponse<{
    run_id: string;
    status: string;
    runner_run_id?: string;
    warning?: string;
  }>(res);
}

// Raw run from Engine API (camelCase with JSON strings)
interface EngineRunRaw {
  runId: string;
  projectId: string | null;
  runnerRunId: string | null;
  commitRef: string | null;
  leafJson: string | null;
  inputsJson: string | null;
  workflowJson: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  resultJson: string | null;
  // Trace data
  traceSummaryJson: string | null;
  fullTraceJson: string | null;
  // v2.1: Metadata for A/B test filtering
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parse raw Engine run (camelCase + JSON strings) to frontend format (snake_case + parsed)
 */
function parseEngineRun(raw: EngineRunRaw): EngineRun {
  const result = safeJsonParse(raw.resultJson, null) as Record<string, unknown> | null;
  const traceSummary = safeJsonParse(raw.traceSummaryJson, null);

  // Merge trace_summary into result for UI compatibility
  const mergedResult = result ? {
    ...result,
    trace_summary: traceSummary,
  } : null;

  return {
    run_id: raw.runId,
    project_id: raw.projectId,
    runner_run_id: raw.runnerRunId,
    commit_ref: raw.commitRef,
    leaf: safeJsonParse(raw.leafJson, null),
    inputs: safeJsonParse(raw.inputsJson, null),
    workflow: safeJsonParse(raw.workflowJson, null),
    status: raw.status,
    result: mergedResult as EngineRun['result'],
    metadata: safeJsonParse(raw.metadataJson, null),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
  };
}

/**
 * Get a run by ID from Engine
 */
export async function getEngineRun(runId: string): Promise<EngineRun> {
  const res = await fetchWithTimeout(`${API_V1}/runs/${encodeURIComponent(runId)}`);
  const data = await handleResponse<EngineRunRaw>(res);
  return parseEngineRun(data);
}

/**
 * List runs from Engine
 *
 * v2.1: Added model and prompt_version filters for A/B test comparison
 */
export async function listEngineRuns(options?: {
  project_id?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  // v2.1: Metadata filters for A/B test
  model?: string;
  prompt_version?: string;
  limit?: number;
  offset?: number;
}): Promise<EngineRunListData> {
  const query = buildQueryString({
    project_id: options?.project_id,
    status: options?.status,
    model: options?.model,
    prompt_version: options?.prompt_version,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
  });
  const res = await fetchWithTimeout(`${API_V1}/runs?${query}`);
  const data = await handleResponse<{ runs: EngineRunRaw[]; limit: number; offset: number }>(res);
  return {
    runs: data.runs.map(parseEngineRun),
    limit: data.limit,
    offset: data.offset,
  };
}

/**
 * Get filter options for runs (unique models and prompt_versions)
 *
 * v2.1: Returns distinct values for populating filter dropdowns in the UI.
 */
export async function getRunFilterOptions(): Promise<{
  models: string[];
  prompt_versions: string[];
}> {
  const res = await fetchWithTimeout(`${API_V1}/runs/filters`);
  const data = await handleResponse<{
    models: string[];
    prompt_versions: string[];
  }>(res);
  return data;
}

// ============================================================================
// A/B Test Comparison API (v2.2)
// ============================================================================

/**
 * 配置组的聚合统计
 * Configuration stats grouped by model + prompt_version
 */
export interface ConfigurationStats {
  model: string;              // 模型名称
  prompt_version: string;     // prompt 版本
  run_count: number;          // 运行次数（样本量）
  pass_count: number;         // 通过次数
  pass_rate: number;          // 通过率 (0-1)
  avg_score: number;          // 平均得分
  avg_latency_ms: number;     // 平均延迟（毫秒）
  avg_tokens: number;         // 平均 token 数
}

/**
 * A/B 测试单项结果
 * Result of statistical test (z-test or t-test)
 */
export interface ABTestResult {
  controlMean: number;                    // 控制组均值
  treatmentMean: number;                  // 实验组均值
  delta: number;                          // 差值 (B - A)
  deltaPercent: number;                   // 差值百分比
  pValue: number;                         // p 值（小于 0.05 表示显著）
  confidenceInterval: [number, number];   // 95% 置信区间
  isSignificant: boolean;                 // 是否统计显著 (p < 0.05)
  sampleSizeAdequate: boolean;            // 样本量是否足够 (>= 30)
}

/**
 * 简单差值结果（无统计检验）
 * Simple delta result without statistical test
 */
export interface SimpleDeltaResult {
  controlMean: number;
  treatmentMean: number;
  delta: number;
  deltaPercent: number;
}

/**
 * A/B 测试对比结果
 * Complete comparison result between two configurations
 */
export interface ComparisonResult {
  control: ConfigurationStats;            // 控制组 A 的统计
  treatment: ConfigurationStats;          // 实验组 B 的统计
  comparison: {
    pass_rate: ABTestResult;              // 通过率对比（z-test）
    avg_score: ABTestResult;              // 平均分对比（t-test）
    avg_latency: SimpleDeltaResult;       // 延迟对比
    avg_tokens: SimpleDeltaResult;        // token 对比
  };
}

/**
 * 获取所有配置的聚合统计
 * Get aggregated stats for all configurations (model + prompt_version combinations)
 *
 * v2.2: Used for selecting which configurations to compare in A/B test
 */
export async function getConfigurations(projectId?: string): Promise<ConfigurationStats[]> {
  const query = projectId ? buildQueryString({ project_id: projectId }) : '';
  const res = await fetchWithTimeout(`${API_V1}/runs/configurations${query ? `?${query}` : ''}`);
  const data = await handleResponse<{ configurations: ConfigurationStats[] }>(res);
  return data.configurations;
}

/**
 * A/B 测试对比两个配置
 * Compare two configurations with statistical significance tests
 *
 * v2.2: Performs z-test for pass_rate and t-test for avg_score
 *
 * @param control - 控制组配置 (A)
 * @param treatment - 实验组配置 (B)
 * @param projectId - 可选的项目 ID 过滤
 */
export async function compareConfigurations(
  control: { model: string; prompt_version: string },
  treatment: { model: string; prompt_version: string },
  projectId?: string
): Promise<ComparisonResult> {
  const res = await fetchWithTimeout(`${API_V1}/runs/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control,
      treatment,
      project_id: projectId,
    }),
  });
  return handleResponse<ComparisonResult>(res);
}

// ============================================================================
// Pins (V4 - source selection for commits and context)
// ============================================================================

export type PinType = 'conversation' | 'leaf';

/** API response format for Pin (uses null for absent values) */
interface ApiPin {
  id: string;
  project_id: string;
  type: PinType;
  ref_id: string;
  selected_assertion_ids: string[] | null;
  pinned_at: string;
  pinned_by: string | null;
}

/** Convert API Pin response to core Pin type (null → undefined) */
function toPin(apiPin: ApiPin): Pin {
  return {
    id: apiPin.id,
    project_id: apiPin.project_id,
    type: apiPin.type,
    ref_id: apiPin.ref_id,
    selected_assertion_ids: apiPin.selected_assertion_ids ?? undefined,
    pinned_at: apiPin.pinned_at,
    pinned_by: apiPin.pinned_by ?? undefined,
  };
}

export type { Pin } from '@t3x/core';

export interface PinListData {
  pins: Pin[];
}

/**
 * List pins by project
 */
export async function listPins(
  projectId: string,
  type?: PinType
): Promise<Pin[]> {
  const query = buildQueryString({ type });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pins${query ? `?${query}` : ''}`
  );
  const apiPins = await handleResponse<ApiPin[]>(res);
  return apiPins.map(toPin);
}

/**
 * Create a new pin
 */
export async function createPinApi(
  projectId: string,
  type: PinType,
  refId: string,
  selectedAssertionIds?: string[]
): Promise<Pin> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pins`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        ref_id: refId,
        selected_assertion_ids: selectedAssertionIds,
      }),
    }
  );
  const apiPin = await handleResponse<ApiPin>(res);
  return toPin(apiPin);
}

/**
 * Delete a pin by ID
 */
export async function deletePinApi(pinId: string): Promise<{ deleted: boolean; id: string }> {
  const res = await fetchWithTimeout(`${API_V1}/pins/${encodeURIComponent(pinId)}`, {
    method: 'DELETE',
  });
  return handleResponse<{ deleted: boolean; id: string }>(res);
}

/**
 * Update pin's selected assertion IDs
 */
export async function updatePinAssertionsApi(
  pinId: string,
  selectedAssertionIds: string[]
): Promise<Pin> {
  const res = await fetchWithTimeout(
    `${API_V1}/pins/${encodeURIComponent(pinId)}/assertions`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selected_assertion_ids: selectedAssertionIds,
      }),
    }
  );
  const apiPin = await handleResponse<ApiPin>(res);
  return toPin(apiPin);
}

// ============================================================================
// Conversation Context
// ============================================================================

export interface ConversationContext {
  conversation_id: string;
  selected_pin_ids: string[] | null;
  updated_at: string;
}

export async function getConversationContext(
  conversationId: string
): Promise<ConversationContext | null> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context`
  );
  return handleResponse<ConversationContext | null>(res);
}

export async function updateConversationContext(
  conversationId: string,
  selectedPinIds: string[] | null
): Promise<ConversationContext> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_pin_ids: selectedPinIds }),
    }
  );
  return handleResponse<ConversationContext>(res);
}

// ============================================================================
// Leaves (V4 - constraints, output, validation)
// ============================================================================

export type LeafType =
  | 'deploy_agent'
  | 'tweet'
  | 'weibo'
  | 'wechat'
  | 'email'
  | 'article'
  | 'slack'
  | 'eval';

export interface RequireConstraint {
  id: string;
  type: 'require';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  source_sentence_id?: string;
}

export interface ExcludeConstraint {
  id: string;
  type: 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  reason?: string;
}

export type Constraint = RequireConstraint | ExcludeConstraint;

export interface Assertion {
  id: string;
  constraint_id: string;
  passed: boolean;
  details: string;
  lesson?: string;
}

export interface LeafConfig {
  prompt_template?: string;
  model?: string;
  max_tokens?: number;
  [key: string]: unknown;
}

export interface Leaf {
  id: string;
  commit_hash: string;
  type: LeafType;
  title: string | null;
  constraints: Constraint[];
  config: LeafConfig;
  output: string | null;
  generated_at: string | null;
  assertions: Assertion[] | null;
  project_id: string;
  created_at: string;
  created_by: string | null;
}

/**
 * Get leaf by ID
 */
export async function getLeaf(leafId: string): Promise<Leaf> {
  const res = await fetchWithTimeout(`${API_V1}/leaves/${encodeURIComponent(leafId)}`);
  return handleResponse<Leaf>(res);
}

/**
 * Update leaf (title, constraints, config)
 */
export async function updateLeaf(
  leafId: string,
  updates: {
    title?: string;
    constraints?: Constraint[];
    config?: LeafConfig;
  }
): Promise<Leaf> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return handleResponse<Leaf>(res);
}

/**
 * Create a new leaf
 */
export interface CreateLeafInput {
  commit_hash: string;
  type: LeafType;
  title?: string;
  project_id: string;
  constraints?: Constraint[];
  config?: LeafConfig;
}

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  const res = await fetchWithTimeout(`${API_V1}/leaves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Leaf>(res);
}

/**
 * Generate output result
 * 生成输出的结果
 */
export interface GenerateLeafOutputResult {
  output: string;        // 生成的输出内容
  generated_at: string;  // 生成时间 (ISO8601)
}

/**
 * Generate output for a leaf
 * 调用 LLM 为 Leaf 生成输出内容
 *
 * @param leafId - Leaf ID
 * @returns Generated output and timestamp
 * @throws ApiError - GENERATION_NOT_CONFIGURED (API key not set)
 * @throws ApiError - LEAF_NOT_FOUND
 * @throws ApiError - GENERATION_FAILED
 */
export async function generateLeafOutput(leafId: string): Promise<GenerateLeafOutputResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  return handleResponse<GenerateLeafOutputResult>(res);
}

/**
 * Validate output result
 * 验证输出的结果
 */
export interface ValidateLeafOutputResult {
  leaf: Leaf;              // 更新后的 Leaf（包含新的 assertions）
  validation: {
    all_passed: boolean;   // 是否全部通过
    passed_count: number;  // 通过的断言数量
    failed_count: number;  // 失败的断言数量
  };
}

/**
 * Validate output for a leaf
 * 验证 Leaf 的输出是否满足约束条件
 *
 * @param leafId - Leaf ID
 * @param useSemantic - 是否使用语义匹配（默认 false，当前仅支持精确匹配）
 * @returns Validation result with updated leaf and statistics
 * @throws ApiError - LEAF_NOT_FOUND
 * @throws ApiError - NO_OUTPUT (output is null)
 * @throws ApiError - NO_CONSTRAINTS (no constraints to validate)
 */
export async function validateLeafOutput(
  leafId: string,
  useSemantic = false
): Promise<ValidateLeafOutputResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/validate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_semantic: useSemantic }),
    }
  );
  return handleResponse<ValidateLeafOutputResult>(res);
}

export async function* chatStream(
  request: ChatRequest
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  // Call API server directly
  const res = await fetch(`${API_V1}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      errorData.error?.code || 'CHAT_ERROR',
      errorData.error?.message || `HTTP ${res.status}`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new ApiError('CHAT_ERROR', 'No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events: data: {...}\n\n
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const event = JSON.parse(dataStr) as ChatStreamEvent;
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

// ============================================================================
// Curate Preview API
// ============================================================================

export type BridgeTemplate = 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify';

export interface CurateChunk {
  id: string;
  start: number;
  end: number;
  text: string;
  score: number;
  selected: boolean;
  cos_intent?: number;
}

/** Anchor candidate in API response (snake_case) */
export interface ApiAnchorCandidate {
  text: string;
  type: 'number' | 'money' | 'duration' | 'percent' | 'date' | 'entity' | 'term' | 'phrase';
  start_char: number;
  end_char: number;
  confidence: number;
  source: 'token' | 'entity' | 'phrase';
}

/**
 * Convert API anchor candidate (snake_case) to internal format (camelCase)
 */
export function parseApiAnchorCandidate(api: ApiAnchorCandidate): RingAnchorCandidate {
  return {
    text: api.text,
    type: api.type,
    startChar: api.start_char,
    endChar: api.end_char,
    confidence: api.confidence,
    source: api.source,
  };
}

/**
 * Convert array of API anchor candidates to internal format
 */
export function parseApiAnchorCandidates(
  apis: ApiAnchorCandidate[] | undefined
): RingAnchorCandidate[] {
  if (!apis) return [];
  return apis.map(parseApiAnchorCandidate);
}

/**
 * Convert API confirmed anchor (snake_case) to internal format (camelCase)
 * Note: global_start/global_end are optional and typically computed in UI layer,
 * not returned from API. See NodeModal.committedAnchors for the computation.
 * Supports both snake_case (global_start) and legacy camelCase (globalStart) for backward compat.
 */
export function parseApiConfirmedAnchor(api: ApiConfirmedAnchor): ConfirmedAnchor {
  // Support both snake_case (new) and camelCase (legacy) for backward compatibility
  const apiAny = api as ApiConfirmedAnchor & { globalStart?: number; globalEnd?: number };
  return {
    id: api.id,
    text: api.text,
    start: api.start,
    end: api.end,
    type: api.type as AnchorType,
    constraint: api.constraint as AnchorConstraint,
    globalStart: api.global_start ?? apiAny.globalStart,
    globalEnd: api.global_end ?? apiAny.globalEnd,
  };
}

/**
 * Convert API sentence with anchors (snake_case) to internal format (camelCase)
 * Computes globalStart/globalEnd for each anchor using sentence.start_char offset
 * If start_char is missing/invalid, anchors will only have their original positions (no global computation)
 */
export function parseApiSentenceWithAnchors(api: ApiSentenceWithAnchors): SentenceWithAnchors {
  const sentenceStartChar = api.start_char;
  const hasValidStartChar = typeof sentenceStartChar === 'number' && !Number.isNaN(sentenceStartChar);

  return {
    sentenceId: api.sentence_id,
    text: api.text,
    startChar: api.start_char,
    endChar: api.end_char,
    anchors: api.anchors?.map((anchor) => {
      const parsed = parseApiConfirmedAnchor(anchor);
      // Compute global positions if not already present and start_char is valid
      // If start_char is missing/corrupt, skip computation to avoid NaN positions
      if (hasValidStartChar) {
        return {
          ...parsed,
          globalStart: parsed.globalStart ?? (sentenceStartChar + parsed.start),
          globalEnd: parsed.globalEnd ?? (sentenceStartChar + parsed.end),
        };
      }
      return parsed;
    }) ?? [],
  };
}

/**
 * Convert API commit anchors (snake_case) to internal format (camelCase)
 * Use this when you need CommitAnchors type for CanvasNodeData.anchors
 */
export function parseApiCommitAnchors(api: ApiCommitAnchors | null): CommitAnchors | null {
  if (!api) return null;
  return {
    inputTextHash: api.input_text_hash,
    sentences: api.sentences?.map(parseApiSentenceWithAnchors) ?? [],
  };
}

export interface CuratePreviewResponse {
  algorithm_version: string;
  keep_ratio: number;
  chunks: CurateChunk[];
  selected_spans: Array<{ start: number; end: number }>;
  /** The source text used for chunking - frontend should use this for tokenization */
  source_text: string;
  /** v1.1: SHA-256 hash of source_text for CommitAnchors.input_text_hash */
  input_text_hash: string;
  /** v1.1: All anchor candidates from Ring1 (global positions, snake_case) */
  anchor_candidates?: ApiAnchorCandidate[];
  /** v1.2: Warnings about data quality issues (e.g., skipped anchors, hash mismatches, fallback mode) */
  warnings?: string[];
}

export interface CuratePreviewRequest {
  project_id: string;
  /** Either source_conversation_id or source_text is required */
  source_conversation_id?: string;
  bridge_id: BridgeTemplate;
  intent: string;
  cosine: number;
  unit_title?: string;
  user_message?: string;
  /** Fallback mode: if provided without source_conversation_id, uses regex splitting (no Ring3/anchors) */
  source_text?: string;
}

/**
 * Get curated preview based on cosine similarity
 *
 * This endpoint calculates which text chunks to select based on:
 * - Bridge template queries (task/schema)
 * - User intent
 * - Cosine similarity threshold (controlled by slider)
 *
 * @param params - Curate preview parameters
 * @param signal - Optional AbortSignal for cancellation (e.g., debounce)
 */
export async function curatePreview(
  params: CuratePreviewRequest,
  signal?: AbortSignal
): Promise<CuratePreviewResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/curate/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    30000, // 30s timeout for embedding computation
    signal
  );
  return handleResponse<CuratePreviewResponse>(res);
}
