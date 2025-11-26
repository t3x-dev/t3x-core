/**
 * Project Cache
 *
 * 管理本地 project_name -> project_id 的映射缓存
 * 以及当前活跃的 project/conversation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { getCoreClient, CoreApiError } from './coreClient';
import { logger } from '../runtime/logger';

// ============================================================================
// Types
// ============================================================================

interface ProjectMapping {
  project_id: string;
  name: string;
  created_at: string;
}

interface ConversationMapping {
  conversation_id: string;
  project_id: string;
  title?: string;
  created_at: string;
}

interface CacheData {
  version: string;
  current_project?: string;
  current_conversation_id?: string;
  projects: Record<string, ProjectMapping>;
  conversations: Record<string, ConversationMapping>; // keyed by conversation_id
}

// ============================================================================
// Cache file operations
// ============================================================================

let cacheDir: string | null = null;
let cacheData: CacheData | null = null;

const CACHE_FILENAME = 'project_cache.json';
const CACHE_VERSION = '1.0.0';

function getCachePath(): string {
  if (!cacheDir) {
    throw new Error('Cache directory not initialized. Call initProjectCache first.');
  }
  return path.join(cacheDir, CACHE_FILENAME);
}

function loadCache(): CacheData {
  if (cacheData) {
    return cacheData;
  }

  const cachePath = getCachePath();
  if (existsSync(cachePath)) {
    try {
      const content = readFileSync(cachePath, 'utf-8');
      cacheData = JSON.parse(content) as CacheData;
      return cacheData;
    } catch (error) {
      logger.warn(`Failed to load cache: ${(error as Error).message}`);
    }
  }

  // Return default cache
  cacheData = {
    version: CACHE_VERSION,
    projects: {},
    conversations: {},
  };
  return cacheData;
}

function saveCache(): void {
  if (!cacheData) {
    return;
  }

  const cachePath = getCachePath();
  try {
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch (error) {
    logger.warn(`Failed to save cache: ${(error as Error).message}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the project cache
 */
export function initProjectCache(contextflowDir: string): void {
  cacheDir = contextflowDir;
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  loadCache();
}

/**
 * Get current project name
 */
export function getCurrentProjectName(): string | undefined {
  const cache = loadCache();
  return cache.current_project;
}

/**
 * Set current project name
 * Also clears current conversation ID since it belongs to a different project
 */
export function setCurrentProjectName(name: string): void {
  const cache = loadCache();
  cache.current_project = name;
  // Clear conversation ID when switching projects
  // The conversation for the new project will be fetched/created on demand
  cache.current_conversation_id = undefined;
  saveCache();
}

/**
 * Get current conversation ID
 */
export function getCurrentConversationId(): string | undefined {
  const cache = loadCache();
  return cache.current_conversation_id;
}

/**
 * Set current conversation ID
 */
export function setCurrentConversationId(conversationId: string): void {
  const cache = loadCache();
  cache.current_conversation_id = conversationId;
  saveCache();
}

/**
 * Get project ID by name from cache
 */
export function getProjectIdByName(name: string): string | undefined {
  const cache = loadCache();
  return cache.projects[name]?.project_id;
}

/**
 * Cache a project mapping
 */
export function cacheProject(name: string, projectId: string, createdAt: string): void {
  const cache = loadCache();
  cache.projects[name] = {
    project_id: projectId,
    name,
    created_at: createdAt,
  };
  saveCache();
}

/**
 * Get all cached project names
 */
export function getCachedProjectNames(): string[] {
  const cache = loadCache();
  return Object.keys(cache.projects).sort();
}

/**
 * Check if a project exists in cache
 */
export function isProjectCached(name: string): boolean {
  const cache = loadCache();
  return name in cache.projects;
}

/**
 * Remove a project from cache
 */
export function uncacheProject(name: string): void {
  const cache = loadCache();
  delete cache.projects[name];
  if (cache.current_project === name) {
    cache.current_project = undefined;
  }
  saveCache();
}

/**
 * Cache a conversation mapping
 */
export function cacheConversation(
  conversationId: string,
  projectId: string,
  title?: string,
  createdAt?: string
): void {
  const cache = loadCache();
  cache.conversations[conversationId] = {
    conversation_id: conversationId,
    project_id: projectId,
    title,
    created_at: createdAt ?? new Date().toISOString(),
  };
  saveCache();
}

/**
 * Get conversation from cache
 */
export function getCachedConversation(conversationId: string): ConversationMapping | undefined {
  const cache = loadCache();
  return cache.conversations[conversationId];
}

// ============================================================================
// Core API integration
// ============================================================================

/**
 * Create a new project via core_api and cache it
 */
export async function createProjectViaApi(name: string): Promise<string> {
  const client = getCoreClient();

  try {
    const project = await client.createProject(name);
    cacheProject(name, project.project_id, project.created_at);
    logger.trace('cache', `Project created and cached: ${name} -> ${project.project_id}`);
    return project.project_id;
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
    throw error;
  }
}

/**
 * List projects from core_api and sync cache
 */
export async function listProjectsViaApi(): Promise<Array<{ name: string; project_id: string }>> {
  const client = getCoreClient();

  try {
    const result = await client.listProjects({ limit: 100 });
    const projects = result.data;

    // Update cache with API results
    const cache = loadCache();
    for (const project of projects) {
      cache.projects[project.name] = {
        project_id: project.project_id,
        name: project.name,
        created_at: project.created_at,
      };
    }
    saveCache();

    return projects.map((p) => ({ name: p.name, project_id: p.project_id }));
  } catch (error) {
    if (error instanceof CoreApiError) {
      // If API is unavailable, fall back to cache
      logger.warn(`Failed to list projects from API: ${error.message}. Using cache.`);
      const cache = loadCache();
      return Object.values(cache.projects).map((p) => ({
        name: p.name,
        project_id: p.project_id,
      }));
    }
    throw error;
  }
}

/**
 * Check if a project exists (in cache or via API)
 */
export async function projectExistsViaApi(name: string): Promise<boolean> {
  // First check cache
  if (isProjectCached(name)) {
    return true;
  }

  // Try to fetch from API and update cache
  try {
    const projects = await listProjectsViaApi();
    return projects.some((p) => p.name === name);
  } catch {
    return false;
  }
}

/**
 * Get or create project ID by name
 * If project doesn't exist, creates it
 */
export async function getOrCreateProjectId(name: string): Promise<string> {
  // Check cache first
  let projectId = getProjectIdByName(name);
  if (projectId) {
    return projectId;
  }

  // Try to find in API
  const projects = await listProjectsViaApi();
  const existing = projects.find((p) => p.name === name);
  if (existing) {
    return existing.project_id;
  }

  // Create new project
  return createProjectViaApi(name);
}

/**
 * Create a conversation for a project
 */
export async function createConversationViaApi(
  projectId: string,
  title?: string
): Promise<string> {
  const client = getCoreClient();

  try {
    const conversation = await client.createConversation(projectId, title);
    cacheConversation(
      conversation.conversation_id,
      projectId,
      title,
      conversation.created_at
    );
    return conversation.conversation_id;
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get or create a default conversation for a project
 */
export async function getOrCreateDefaultConversation(projectId: string): Promise<string> {
  const client = getCoreClient();

  try {
    // Try to get existing conversations
    const result = await client.listConversations(projectId, { limit: 1 });
    if (result.data.length > 0) {
      const conv = result.data[0];
      cacheConversation(conv.conversation_id, projectId, conv.title, conv.created_at);
      return conv.conversation_id;
    }

    // Create default conversation
    return createConversationViaApi(projectId, 'Default');
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to get/create conversation: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Sync cache with core_api
 * Fetches all projects and updates local cache
 */
export async function syncCache(): Promise<void> {
  try {
    await listProjectsViaApi();
    logger.trace('cache', 'Cache synced with core_api');
  } catch (error) {
    logger.warn(`Failed to sync cache: ${(error as Error).message}`);
  }
}

// ============================================================================
// Turn API integration
// ============================================================================

/**
 * Create a turn via core_api
 * Returns the turn_hash from the API
 */
export async function createTurnViaApi(
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string
): Promise<string> {
  const client = getCoreClient();

  try {
    const turn = await client.createTurn(projectId, conversationId, role, content);
    logger.trace('cache', `Turn created: ${turn.turn_hash}`);
    return turn.turn_hash;
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create turn: ${error.message}`);
    }
    throw error;
  }
}

/**
 * List turns for a project via core_api
 */
export async function listTurnsViaApi(
  projectId: string,
  options?: {
    conversationId?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Array<{
  turn_hash: string;
  role: string;
  content: string;
  created_at: string;
}>> {
  const client = getCoreClient();

  try {
    const result = await client.listTurns(projectId, {
      conversation_id: options?.conversationId,
      role: options?.role,
      limit: options?.limit ?? 50,
      offset: options?.offset,
    });
    return result.data.map(turn => ({
      turn_hash: turn.turn_hash,
      role: turn.role,
      content: turn.content,
      created_at: turn.created_at,
    }));
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to list turns: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get current conversation ID for a project
 * If no conversation exists, creates a default one
 */
export async function ensureConversationForProject(projectName: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  // Get or create project
  const projectId = await getOrCreateProjectId(projectName);

  // Get or create default conversation
  const conversationId = await getOrCreateDefaultConversation(projectId);

  // Update cache with current conversation
  setCurrentConversationId(conversationId);

  return { projectId, conversationId };
}

// ============================================================================
// Branch API integration
// ============================================================================

/**
 * List branches for a project via core_api
 */
export async function listBranchesViaApi(
  projectId: string
): Promise<Array<{
  name: string;
  is_current: boolean;
  head_commit_hash: string | null;
  parent_branch: string | null;
}>> {
  const client = getCoreClient();

  try {
    const result = await client.listBranches(projectId);
    return result.data.map(branch => ({
      name: branch.name,
      is_current: branch.is_current,
      head_commit_hash: branch.head_commit_hash ?? null,
      parent_branch: branch.parent_branch ?? null,
    }));
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to list branches: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Create a new branch via core_api
 */
export async function createBranchViaApi(
  projectId: string,
  name: string,
  options?: {
    fromBranch?: string;
    description?: string;
    checkout?: boolean;
  }
): Promise<{
  branch_id: string;
  name: string;
  is_current: boolean;
}> {
  const client = getCoreClient();

  try {
    const branch = await client.createBranch(projectId, name, {
      from_branch: options?.fromBranch,
      description: options?.description,
      checkout: options?.checkout ?? true,
    });
    return {
      branch_id: branch.branch_id,
      name: branch.name,
      is_current: branch.is_current,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Switch to a branch via core_api
 */
export async function switchBranchViaApi(
  projectId: string,
  name: string,
  options?: {
    create?: boolean;
    fromBranch?: string;
    description?: string;
  }
): Promise<{
  current_branch: string;
  head_commit_hash: string | null;
}> {
  const client = getCoreClient();

  try {
    const result = await client.switchBranch(projectId, name, {
      create: options?.create,
      from_branch: options?.fromBranch,
      description: options?.description,
    });
    return {
      current_branch: result.current_branch,
      head_commit_hash: result.head_commit_hash ?? null,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to switch branch: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get current branch for a project via core_api
 */
export async function getCurrentBranchViaApi(
  projectId: string
): Promise<{
  current_branch: string;
  head_commit_hash: string | null;
}> {
  const client = getCoreClient();

  try {
    const result = await client.getCurrentBranch(projectId);
    return {
      current_branch: result.current_branch,
      head_commit_hash: result.head_commit_hash ?? null,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// Commit API integration
// ============================================================================

/**
 * List commits for a project via core_api
 */
export async function listCommitsViaApi(
  projectId: string,
  options?: {
    branch?: string;
    limit?: number;
  }
): Promise<Array<{
  commit_hash: string;
  branch: string;
  message: string | null;
  created_at: string;
}>> {
  const client = getCoreClient();

  try {
    const result = await client.listCommits(projectId, options);
    return result.data.map(commit => ({
      commit_hash: commit.commit_hash,
      branch: commit.branch,
      message: commit.message ?? null,
      created_at: commit.created_at,
    }));
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to list commits: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Compute diff between two commits via core_api
 */
export async function diffCommitsViaApi(
  baseCommitHash: string,
  targetCommitHash: string
): Promise<{
  facet_changes: Array<{
    facet: string;
    change_type: string;
    base_text?: string;
    target_text?: string;
    added_keywords: string[];
    removed_keywords: string[];
  }>;
  segment_changes: Array<{
    segment_id: string;
    change_type: string;
    text: string;
  }>;
}> {
  const client = getCoreClient();

  try {
    const result = await client.diff(baseCommitHash, targetCommitHash);
    return {
      facet_changes: result.diff.facet_changes,
      segment_changes: result.diff.segment_changes,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to compute diff: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// System status API
// ============================================================================

/**
 * Get system status from core_api
 */
export async function getSystemStatusViaApi(): Promise<{
  projects_count: number;
  conversations_count: number;
  turns_count: number;
  commits_count: number;
}> {
  const client = getCoreClient();

  try {
    const status = await client.status();
    return {
      projects_count: status.projects_count,
      conversations_count: status.conversations_count,
      turns_count: status.turns_count,
      commits_count: status.commits_count,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to get system status: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Create a commit via core_api
 */
export async function createCommitViaApi(
  projectId: string,
  conversationId: string,
  turnWindow: {
    start_turn_hash: string;
    end_turn_hash: string;
  },
  options?: {
    branch?: string;
    message?: string;
  }
): Promise<{
  commit_hash: string;
  branch: string;
  created_at: string;
}> {
  const client = getCoreClient();

  try {
    const commit = await client.createCommit(projectId, conversationId, turnWindow, {
      branch: options?.branch,
      message: options?.message,
    });
    return {
      commit_hash: commit.commit_hash,
      branch: commit.branch,
      created_at: commit.created_at,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create commit: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// Draft API (Agentic Layer)
// ============================================================================

/**
 * Create a draft via core_api
 */
export async function createDraftViaApi(
  projectId: string,
  conversationId: string,
  bridgeId: 'plan' | 'summary' | 'explain' | 'clarify',
  intent: string,
  options?: {
    base_commit_hash?: string;
    turn_anchor_hash?: string;
    llm_config?: {
      provider?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
    };
  }
): Promise<{
  draft_id: string;
  status: string;
  text: string | null;
  must_have: string[];
  mustnt_have: string[];
  validation_passed: boolean;
  created_at: string;
  completed_at: string | null;
}> {
  const client = getCoreClient();

  try {
    const draft = await client.createDraft(projectId, conversationId, bridgeId, intent, options);
    return {
      draft_id: draft.draft_id,
      status: draft.status,
      text: draft.text ?? null,
      must_have: draft.must_have,
      mustnt_have: draft.mustnt_have,
      validation_passed: draft.validation?.passed ?? false,
      created_at: draft.created_at,
      completed_at: draft.completed_at ?? null,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to create draft: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a draft via core_api
 */
export async function getDraftViaApi(draftId: string): Promise<{
  draft_id: string;
  project_id: string;
  status: string;
  bridge_id: string;
  intent: string;
  text: string | null;
  must_have: string[];
  mustnt_have: string[];
  validation_passed: boolean;
  created_at: string;
  completed_at: string | null;
}> {
  const client = getCoreClient();

  try {
    const draft = await client.getDraft(draftId);
    return {
      draft_id: draft.draft_id,
      project_id: draft.project_id,
      status: draft.status,
      bridge_id: draft.bridge_id,
      intent: draft.intent,
      text: draft.text ?? null,
      must_have: draft.must_have,
      mustnt_have: draft.mustnt_have,
      validation_passed: draft.validation?.passed ?? false,
      created_at: draft.created_at,
      completed_at: draft.completed_at ?? null,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to get draft: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Update a draft via core_api
 */
export async function updateDraftViaApi(
  draftId: string,
  options: {
    feedback?: string;
    append_must_have?: string[];
  }
): Promise<{
  draft_id: string;
  status: string;
  text: string | null;
  must_have: string[];
  validation_passed: boolean;
  completed_at: string | null;
}> {
  const client = getCoreClient();

  try {
    const draft = await client.updateDraft(draftId, options);
    return {
      draft_id: draft.draft_id,
      status: draft.status,
      text: draft.text ?? null,
      must_have: draft.must_have,
      validation_passed: draft.validation?.passed ?? false,
      completed_at: draft.completed_at ?? null,
    };
  } catch (error) {
    if (error instanceof CoreApiError) {
      throw new Error(`Failed to update draft: ${error.message}`);
    }
    throw error;
  }
}
