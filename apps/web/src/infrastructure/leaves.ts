/**
 * Leaves + Curate Preview API
 */

import type { ApiAnchorCandidate } from '@/types/anchors';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Leaf Types
// ============================================================================

export type LeafType =
  | 'tweet'
  | 'weibo'
  | 'wechat'
  | 'email'
  | 'article'
  | 'slack'
  | 'deploy_agent';

export interface ConstraintSourceNode {
  frame_type: string;
  slot_key?: string;
}

export interface RequireConstraint {
  id: string;
  type: 'require';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  /** Link to source  node + slot (tree-based traceability) */
  source_node?: ConstraintSourceNode;
}

export interface ExcludeConstraint {
  id: string;
  type: 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  reason?: string;
  /** Link to source  node + slot (tree-based traceability) */
  source_node?: ConstraintSourceNode;
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
  runner_assertions: Assertion[] | null;
  project_id: string;
  created_at: string;
  created_by: string | null;
}

// ============================================================================
// Leaf CRUD
// ============================================================================

/**
 * List leaves by commit hash
 */
export async function listLeavesByCommit(commitHash: string): Promise<Leaf[]> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(commitHash)}/leaves`);
  return handleResponse<Leaf[]>(res);
}

/**
 * List leaves by project
 */
export async function listLeavesByProject(projectId: string): Promise<Leaf[]> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/leaves`);
  return handleResponse<Leaf[]>(res);
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
  const res = await fetchWithTimeout(`${API_V1}/leaves/${encodeURIComponent(leafId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
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
  /**
   * Provenance carried by commands/leaves.createLeaf; asserted before
   * any HTTP write (see commands/leaves/leafSource.ts). Unknown to the
   * backend today — forwarded as extra JSON and safely ignored.
   */
  source: { type: 'user'; author?: string } | { type: 'agent'; model: string; timestamp: string };
}

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  const res = await fetchWithTimeout(`${API_V1}/leaves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Leaf>(res);
}

export async function deleteLeaf(leafId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/leaves/${encodeURIComponent(leafId)}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

/**
 * Generate output result
 */
export interface GenerateLeafOutputResult {
  output: string;
  generated_at: string;
  validation?: {
    all_passed: boolean;
    passed_count: number;
    failed_count: number;
    attempts: number;
  };
  /** Multi-round generation details (present when mode is standard or thorough) */
  rounds?: Array<{
    name: string;
    round_number: number;
    constraints_passed: boolean;
    failed_constraints: string[];
  }>;
  /** Total rounds executed */
  total_rounds?: number;
  /** Generation mode used */
  mode?: 'fast' | 'standard' | 'thorough';
}

/**
 * Generate output request options
 */
export interface GenerateLeafOutputOptions {
  /** Generation mode: 'fast' (1 round), 'standard' (2 rounds), 'thorough' (3 rounds) */
  mode?: 'fast' | 'standard' | 'thorough';
  /** Style preferences for thorough mode (Round 3) */
  style_preferences?: {
    tone?: string;
    length?: string;
    formality?: string;
  };
}

/**
 * Generate output for a leaf
 *
 * @param leafId - Leaf ID
 * @param options - Optional generation options (mode, style_preferences)
 * @returns Generated output and timestamp
 * @throws ApiError - GENERATION_NOT_CONFIGURED (API key not set)
 * @throws ApiError - LEAF_NOT_FOUND
 * @throws ApiError - GENERATION_FAILED
 */
export async function generateLeafOutput(
  leafId: string,
  options?: GenerateLeafOutputOptions
): Promise<GenerateLeafOutputResult> {
  const body: Record<string, unknown> = {};
  if (options?.mode) body.mode = options.mode;
  if (options?.style_preferences) body.style_preferences = options.style_preferences;

  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    180000 // 180 seconds timeout for LLM generation with auto-retry
  );
  return handleResponse<GenerateLeafOutputResult>(res);
}

/**
 * Compare models result
 */
export interface CompareModelsResult {
  results: Array<{
    model: string;
    provider_id: string;
    output: string | null;
    latency_ms: number;
    error?: string;
  }>;
}

/**
 * Compare multiple models for a leaf
 */
export async function compareLeafModels(
  leafId: string,
  models: string[]
): Promise<CompareModelsResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/compare`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models }),
    },
    300000 // 5 minutes for parallel generation
  );
  return handleResponse<CompareModelsResult>(res);
}

/**
 * Validate output result
 */
export interface ValidateLeafOutputResult {
  leaf: Leaf;
  validation: {
    all_passed: boolean;
    passed_count: number;
    failed_count: number;
  };
}

/**
 * Validate output for a leaf
 *
 * @param leafId - Leaf ID
 * @param useSemantic - Whether to use semantic matching (default false)
 * @returns Validation result with updated leaf and statistics
 * @throws ApiError - LEAF_NOT_FOUND
 * @throws ApiError - NO_OUTPUT (output is null)
 * @throws ApiError - NO_CONSTRAINTS (no constraints to validate)
 */
export async function validateLeafOutput(
  leafId: string,
  useSemantic = false
): Promise<ValidateLeafOutputResult> {
  const res = await fetchWithTimeout(`${API_V1}/leaves/${encodeURIComponent(leafId)}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ use_semantic: useSemantic }),
  });
  return handleResponse<ValidateLeafOutputResult>(res);
}

// ============================================================================
// AI Constraint Suggestions
// ============================================================================

/** AI-suggested constraint */
export interface SuggestedConstraint {
  type: 'require' | 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  reason: string;
}

/** Constraint suggestion response */
export interface SuggestConstraintsResult {
  suggestions: SuggestedConstraint[];
  constraints: Array<{
    id: string;
    type: 'require' | 'exclude';
    match_mode: 'exact' | 'semantic';
    value: string;
    description?: string;
    reason?: string;
  }>;
  model: string;
}

/**
 * Get AI-suggested constraints for a leaf.
 */
export async function suggestLeafConstraints(
  leafId: string,
  options?: { max_suggestions?: number; instructions?: string }
): Promise<SuggestConstraintsResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/suggest-constraints`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
    },
    60_000
  );
  return handleResponse<SuggestConstraintsResult>(res);
}

// ============================================================================
// Reverse Learning (Constraint Suggestions from Failed Assertions)
// ============================================================================

export interface ReverseLearnResult {
  suggestions: SuggestedConstraint[];
  lessons_used: string[];
  model: string;
}

export async function reverseLearnConstraints(
  leafId: string,
  maxSuggestions = 5
): Promise<ReverseLearnResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/reverse-learn`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_suggestions: maxSuggestions }),
    },
    30_000
  );
  return handleResponse<ReverseLearnResult>(res);
}

// ============================================================================
// Learn From Edits (Constraint Reverse Learning from Output Edits — Item 17)
// ============================================================================

/** Learned constraint from output edit patterns */
export interface EditLearnedConstraint extends SuggestedConstraint {
  dimension: 'style' | 'content' | 'format';
}

export interface LearnFromEditsResult {
  suggestions: EditLearnedConstraint[];
  edits_analyzed: number;
  model: string;
}

/**
 * Analyze user output edits to discover implicit constraints.
 */
export async function learnFromEdits(
  leafId: string,
  maxSuggestions = 5
): Promise<LearnFromEditsResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/leaves/${encodeURIComponent(leafId)}/learn-from-edits`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_suggestions: maxSuggestions }),
    },
    30_000
  );
  return handleResponse<LearnFromEditsResult>(res);
}

// ============================================================================
// Curate Preview API
// ============================================================================

export type BridgeTemplate =
  | 'prose'
  | 'plan'
  | 'story'
  | 'summary'
  | 'refine'
  | 'explain'
  | 'clarify';

export interface CurateChunk {
  id: string;
  start: number;
  end: number;
  text: string;
  score: number;
  selected: boolean;
  cos_intent?: number;
  /** v1.3: Turn hash this chunk belongs to (for source context display) */
  turn_hash?: string;
  /** v1.3: Start position relative to turn.content (without [role]: prefix) */
  turn_start?: number;
  /** v1.3: End position relative to turn.content (without [role]: prefix) */
  turn_end?: number;
}

/** Anchor candidate in API response (snake_case) */
// Anchor parsers and the ApiAnchorCandidate type have moved:
//   - Api types  -> @/types/anchors
//   - Pure parsers -> @/domain/commitAnchors  (per v2 §2.2)
// The ApiAnchorCandidate import above is kept because CuratePreviewResponse
// (below) uses it. If you need a parser (e.g. parseApiCommitAnchors),
// import from @/domain/commitAnchors directly.

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
