/**
 * Merge Workspace Store
 *
 * Zustand store for managing the full-screen merge workspace state.
 * Handles draft persistence, auto-save, and user decisions.
 */

import { create } from 'zustand';
import { getTerminology, type TermKey } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { API_V1, fetchWithTimeout, handleResponse } from '@/lib/api/core';
import { useSettingsStore } from '@/store/settingsStore';
import type {
  CommitV3,
  Merge2WayResult,
  MergeDraft,
  Sentence,
  TurnContextData,
} from '@/types/merge';
import { useCanvasStore } from './canvasStore';

// ============================================================================
// Types
// ============================================================================

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Extended resolution types for WebUI layer
 * Core MergeSimilarPair.resolution only supports 'source' | 'target'
 * We store extended resolutions separately and map at commit time
 */
export type ExtendedResolutionType = 'both';

export interface ExtendedResolutionData {
  type: ExtendedResolutionType;
}

/**
 * Check if a conflict at given index is resolved
 * Shared logic for UI and store methods
 */
export function isConflictResolved(
  pair: { resolution?: 'source' | 'target' },
  extRes: ExtendedResolutionData | undefined
): boolean {
  // Standard resolution
  if (pair.resolution) return true;

  // Extended resolution (both)
  if (extRes?.type === 'both') return true;

  return false;
}

/**
 * Resolution statistics for display
 */
export interface ResolutionStats {
  standard: number; // source or target
  both: number;
  unresolved: number;
}

/**
 * Cached turn context data for inline display
 */
export interface CachedTurnContext {
  data: TurnContextData;
  loadedAt: Date;
}

interface MergeWorkspaceState {
  // Draft data
  draftId: string | null;
  projectId: string | null;
  sourceHash: string | null;
  targetHash: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  prepared: Merge2WayResult | null;
  message: string;
  status: MergeDraft['status'] | null;

  // UI state
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  lastSavedAt: Date | null;
  isDirty: boolean;

  // Preview state
  previewExpanded: boolean;

  // Extended resolution state (WebUI layer only)
  // Key: pair index as string, Value: extended resolution data
  extendedResolutions: Record<string, ExtendedResolutionData>;
  // Key: turn_hash, Value: cached context data
  contextCache: Record<string, CachedTurnContext>;
  // Key: turn_hash, Value: loading state
  contextLoadingStates: Record<string, boolean>;

  // Server-side merge checks (from backend API)
  serverChecks: MergeCheck[];
  serverChecksLoading: boolean;
  serverChecksError: string | null;

  // Actions
  fetchServerChecks: () => Promise<void>;
  loadDraft: (draftId: string) => Promise<void>;
  createDraft: (
    projectId: string,
    sourceHash: string,
    targetHash: string,
    sourceBranch?: string,
    targetBranch?: string
  ) => Promise<string>;
  resolvePair: (index: number, pick: 'source' | 'target') => void;
  toggleKeep: (side: 'source' | 'target', index: number) => void;
  setMessage: (message: string) => void;
  saveDraft: () => Promise<void>;
  commitMerge: (branch?: string) => Promise<CommitV3>;
  cancelMerge: () => Promise<void>;
  reset: () => void;

  // Preview actions
  togglePreview: () => void;

  // Extended resolution actions
  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => void;
  fetchSourceContext: (turnHash: string, sentence: Sentence) => Promise<TurnContextData | null>;
  getEffectiveResolution: (index: number) => 'source' | 'target' | 'both' | null;

  // Computed getters
  getUnresolvedCount: () => number;
  getResolutionStats: () => ResolutionStats;
  canCommit: () => boolean;
  getPreviewSentences: () => Sentence[];
  getMergeChecks: () => MergeCheck[];
}

/**
 * Merge check item for the Review Dialog checklist
 */
export interface MergeCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
  /** 'frontend' checks gate merge; 'server' checks are advisory only */
  source?: 'frontend' | 'server';
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`${API_V1}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return handleResponse<T>(response);
}

// ============================================================================
// Data Transformation: API (source_ref) → Frontend (source)
// ============================================================================

/**
 * Transform a sentence from API format (source_ref) to frontend format (source)
 * API uses DiffableSentence.source_ref, frontend uses Sentence.source
 *
 * Note: Also checks for 'sourceRef' (camelCase) as fallback in case of
 * serialization inconsistency somewhere in the stack.
 */
interface ApiSentenceSourceRef {
  conversation_id?: string;
  conversationId?: string;
  turn_hash?: string;
  turnHash?: string;
  start_char?: number;
  startChar?: number;
  end_char?: number;
  endChar?: number;
}

interface ApiSentence {
  id: string;
  text: string;
  confidence?: number;
  source_ref?: ApiSentenceSourceRef;
  sourceRef?: ApiSentenceSourceRef;
}

function transformSentence(apiSentence: ApiSentence): Sentence {
  // Try snake_case first (standard), then camelCase (fallback)
  const ref = apiSentence.source_ref || apiSentence.sourceRef;

  if (!ref) {
    return {
      id: apiSentence.id,
      text: apiSentence.text,
      confidence: apiSentence.confidence,
    };
  }

  // Handle both snake_case and camelCase field names within the ref
  const turnHash = ref.turn_hash || ref.turnHash;
  const startChar = ref.start_char ?? ref.startChar;
  const endChar = ref.end_char ?? ref.endChar;
  const conversationId = ref.conversation_id || ref.conversationId;

  if (!turnHash) {
    return {
      id: apiSentence.id,
      text: apiSentence.text,
      confidence: apiSentence.confidence,
    };
  }

  return {
    id: apiSentence.id,
    text: apiSentence.text,
    confidence: apiSentence.confidence,
    source: {
      conversation_id: conversationId,
      turn_hash: turnHash,
      start_char: startChar ?? 0,
      end_char: endChar ?? 0,
    },
  };
}

/**
 * Transform prepared merge result from API format to frontend format
 */
function transformPrepared(apiPrepared: Record<string, unknown>): Merge2WayResult {
  const prepared = apiPrepared as {
    identical: ApiSentence[];
    similarPairs: Array<{
      source: ApiSentence;
      target: ApiSentence;
      wordDiff: unknown[];
      resolution?: 'source' | 'target';
    }>;
    onlyInSource: Array<{ sentence: ApiSentence; keep: boolean }>;
    onlyInTarget: Array<{ sentence: ApiSentence; keep: boolean }>;
  };

  return {
    identical: prepared.identical.map(transformSentence),
    similarPairs: prepared.similarPairs.map((pair) => ({
      source: transformSentence(pair.source),
      target: transformSentence(pair.target),
      wordDiff: pair.wordDiff as Merge2WayResult['similarPairs'][0]['wordDiff'],
      resolution: pair.resolution,
    })),
    onlyInSource: prepared.onlyInSource.map((item) => ({
      sentence: transformSentence(item.sentence),
      keep: item.keep,
    })),
    onlyInTarget: prepared.onlyInTarget.map((item) => ({
      sentence: transformSentence(item.sentence),
      keep: item.keep,
    })),
  };
}

// Convert API response (snake_case) to internal format (camelCase)
function apiDraftToInternal(apiDraft: Record<string, unknown>): {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  prepared: Merge2WayResult;
  status: MergeDraft['status'];
  message: string | null;
} {
  return {
    draftId: apiDraft.draftId as string,
    projectId: apiDraft.projectId as string,
    sourceHash: apiDraft.sourceHash as string,
    targetHash: apiDraft.targetHash as string,
    sourceBranch: (apiDraft.sourceBranch as string) || null,
    targetBranch: (apiDraft.targetBranch as string) || null,
    prepared: transformPrepared(apiDraft.prepared as Record<string, unknown>),
    status: apiDraft.status as MergeDraft['status'],
    message: (apiDraft.message as string) || null,
  };
}

// Module-level save status timer — tracked so reset() can cancel it
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Store
// ============================================================================

const initialState = {
  draftId: null,
  projectId: null,
  sourceHash: null,
  targetHash: null,
  sourceBranch: null,
  targetBranch: null,
  prepared: null,
  message: '',
  status: null,
  loading: false,
  saveStatus: 'idle' as SaveStatus,
  error: null,
  lastSavedAt: null,
  isDirty: false,
  previewExpanded: false,
  extendedResolutions: {} as Record<string, ExtendedResolutionData>,
  contextCache: {} as Record<string, CachedTurnContext>,
  contextLoadingStates: {} as Record<string, boolean>,
  serverChecks: [] as MergeCheck[],
  serverChecksLoading: false,
  serverChecksError: null,
};

export const useMergeWorkspaceStore = create<MergeWorkspaceState>((set, get) => ({
  ...initialState,

  // ============================================================================
  // Draft Actions
  // ============================================================================

  loadDraft: async (draftId: string) => {
    set({ loading: true, error: null });

    try {
      const apiDraft = await fetchApi<Record<string, unknown>>(`/merge/drafts/${draftId}`);
      const draft = apiDraftToInternal(apiDraft);

      set({
        draftId: draft.draftId,
        projectId: draft.projectId,
        sourceHash: draft.sourceHash,
        targetHash: draft.targetHash,
        sourceBranch: draft.sourceBranch,
        targetBranch: draft.targetBranch,
        prepared: draft.prepared,
        status: draft.status,
        message: draft.message || '',
        loading: false,
        isDirty: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load draft';
      set({ loading: false, error: message });
      throw err;
    }
  },

  createDraft: async (
    projectId: string,
    sourceHash: string,
    targetHash: string,
    sourceBranch?: string,
    targetBranch?: string
  ) => {
    set({ loading: true, error: null });

    try {
      const apiDraft = await fetchApi<Record<string, unknown>>('/merge/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          source_hash: sourceHash,
          target_hash: targetHash,
          source_branch: sourceBranch,
          target_branch: targetBranch,
        }),
      });
      const draft = apiDraftToInternal(apiDraft);

      set({
        draftId: draft.draftId,
        projectId: draft.projectId,
        sourceHash: draft.sourceHash,
        targetHash: draft.targetHash,
        sourceBranch: draft.sourceBranch,
        targetBranch: draft.targetBranch,
        prepared: draft.prepared,
        status: draft.status,
        message: '',
        loading: false,
        isDirty: false,
      });

      return draft.draftId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft';
      set({ loading: false, error: message });
      throw err;
    }
  },

  resolvePair: (index: number, pick: 'source' | 'target') => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return;

    const newPrepared = { ...prepared };
    newPrepared.similarPairs = [...prepared.similarPairs];
    newPrepared.similarPairs[index] = {
      ...newPrepared.similarPairs[index],
      resolution: pick,
    };

    // Clear any extended resolution for this index
    const key = String(index);
    if (extendedResolutions[key]) {
      const newExtended = { ...extendedResolutions };
      delete newExtended[key];
      set({ prepared: newPrepared, extendedResolutions: newExtended, isDirty: true });
    } else {
      set({ prepared: newPrepared, isDirty: true });
    }
  },

  toggleKeep: (side: 'source' | 'target', index: number) => {
    const { prepared } = get();
    if (!prepared) return;

    const newPrepared = { ...prepared };
    const list = side === 'source' ? 'onlyInSource' : 'onlyInTarget';
    newPrepared[list] = [...prepared[list]];
    newPrepared[list][index] = {
      ...newPrepared[list][index],
      keep: !newPrepared[list][index].keep,
    };

    set({ prepared: newPrepared, isDirty: true });
  },

  setMessage: (message: string) => {
    set({ message, isDirty: true });
  },

  saveDraft: async () => {
    const { draftId, prepared, message, isDirty, status } = get();
    if (!draftId || !isDirty || status === 'committed') return;

    set({ saveStatus: 'saving' });

    try {
      await fetchApi(`/merge/drafts/${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({ prepared, message }),
      });

      set({
        saveStatus: 'saved',
        isDirty: false,
        lastSavedAt: new Date(),
      });

      // Reset to idle after 2 seconds
      if (saveStatusTimer) clearTimeout(saveStatusTimer);
      saveStatusTimer = setTimeout(() => {
        saveStatusTimer = null;
        const current = get();
        if (current.saveStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save';
      // Only set saveStatus indicator, NOT the page-level error
      // (auto-save failure should not replace the entire workspace with error screen)
      set({ saveStatus: 'error' });
      console.warn('[MergeWorkspace] Auto-save failed:', errorMsg);
    }
  },

  commitMerge: async (branch?: string) => {
    const { draftId, message, targetBranch } = get();
    if (!draftId) throw new Error('No draft to commit');

    // Don't set loading: true here — the MergeReviewDialog has its own
    // 'committing' state. Setting loading would unmount MergeWorkspace
    // (the page shows a spinner when loading=true) and kill the dialog.
    set({ error: null });

    try {
      const commitResult = await fetchApi<CommitV3>(`/merge/drafts/${draftId}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          branch: branch || targetBranch || 'main',
        }),
      });

      set({
        status: 'committed',
        isDirty: false,
        extendedResolutions: {},
        contextCache: {},
        contextLoadingStates: {},
      });

      // Force canvas to reload data by clearing its projectId
      // This ensures the new merge commit will be displayed
      const projectId = get().projectId;
      if (projectId) {
        useCanvasStore.getState().loadProjectData(projectId);
      }

      return commitResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
      set({ error: errorMsg });
      throw err;
    }
  },

  cancelMerge: async () => {
    const { draftId } = get();
    if (!draftId) return;

    try {
      await fetchApi(`/merge/drafts/${draftId}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore errors on cancel
    }

    get().reset();
  },

  reset: () => {
    if (saveStatusTimer) {
      clearTimeout(saveStatusTimer);
      saveStatusTimer = null;
    }
    set(initialState);
  },

  // ============================================================================
  // Preview Actions
  // ============================================================================

  togglePreview: () => {
    set((state) => ({ previewExpanded: !state.previewExpanded }));
  },

  // ============================================================================
  // Server Checks
  // ============================================================================

  fetchServerChecks: async () => {
    const { draftId } = get();
    if (!draftId) return;

    set({ serverChecksLoading: true, serverChecksError: null });
    try {
      const result = await fetchApi<MergeCheck[]>(`/merge/drafts/${draftId}/checks`);
      set({ serverChecks: result, serverChecksLoading: false });
    } catch (err) {
      set({
        serverChecksLoading: false,
        serverChecksError: err instanceof Error ? err.message : 'Failed to fetch server checks',
      });
    }
  },

  // ============================================================================
  // Computed Getters
  // ============================================================================

  getUnresolvedCount: () => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return 0;

    let count = 0;
    for (let i = 0; i < prepared.similarPairs.length; i++) {
      const pair = prepared.similarPairs[i];
      const extRes = extendedResolutions[String(i)];

      if (!isConflictResolved(pair, extRes)) {
        count++;
      }
    }
    return count;
  },

  getResolutionStats: (): ResolutionStats => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return { standard: 0, both: 0, unresolved: 0 };

    const stats: ResolutionStats = { standard: 0, both: 0, unresolved: 0 };

    for (let i = 0; i < prepared.similarPairs.length; i++) {
      const pair = prepared.similarPairs[i];
      const extRes = extendedResolutions[String(i)];

      if (pair.resolution === 'source' || pair.resolution === 'target') {
        stats.standard++;
      } else if (extRes?.type === 'both') {
        stats.both++;
      } else {
        stats.unresolved++;
      }
    }

    return stats;
  },

  canCommit: () => {
    const { prepared, message, status } = get();
    if (!prepared || status !== 'pending') return false;
    if (!message.trim()) return false;

    // Use getUnresolvedCount which handles extended resolutions
    return get().getUnresolvedCount() === 0;
  },

  getPreviewSentences: () => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return [];

    const sentences: Sentence[] = [];

    // Add identical sentences
    sentences.push(...prepared.identical);

    // Add resolved similar pairs (including extended resolutions)
    for (let i = 0; i < prepared.similarPairs.length; i++) {
      const pair = prepared.similarPairs[i];
      const key = String(i);
      const extRes = extendedResolutions[key];

      if (pair.resolution === 'source') {
        sentences.push(pair.source);
      } else if (pair.resolution === 'target') {
        sentences.push(pair.target);
      } else if (extRes?.type === 'both') {
        // Include both sentences
        sentences.push(pair.source);
        sentences.push(pair.target);
      }
    }

    // Add kept source-only sentences
    for (const candidate of prepared.onlyInSource) {
      if (candidate.keep) {
        sentences.push(candidate.sentence);
      }
    }

    // Add kept target-only sentences
    for (const candidate of prepared.onlyInTarget) {
      if (candidate.keep) {
        sentences.push(candidate.sentence);
      }
    }

    return sentences;
  },

  // ============================================================================
  // Extended Resolution Actions
  // ============================================================================

  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return;

    const key = String(index);

    if (resolution === 'source' || resolution === 'target') {
      // Standard resolution - update prepared and clear extended
      const newPrepared = { ...prepared };
      newPrepared.similarPairs = [...prepared.similarPairs];
      newPrepared.similarPairs[index] = {
        ...newPrepared.similarPairs[index],
        resolution,
      };

      const newExtended = { ...extendedResolutions };
      delete newExtended[key];
      set({ prepared: newPrepared, extendedResolutions: newExtended, isDirty: true });
    } else {
      // Extended resolution (both) - clear standard and set extended
      const newPrepared = { ...prepared };
      newPrepared.similarPairs = [...prepared.similarPairs];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { resolution: _, ...pairWithoutResolution } = newPrepared.similarPairs[index];
      newPrepared.similarPairs[index] =
        pairWithoutResolution as (typeof newPrepared.similarPairs)[number];

      const newExtended = { ...extendedResolutions };
      newExtended[key] = { type: 'both' };
      set({ prepared: newPrepared, extendedResolutions: newExtended, isDirty: true });
    }
  },

  fetchSourceContext: async (turnHash: string, sentence: Sentence) => {
    const { contextCache, contextLoadingStates } = get();

    // Check cache first
    if (contextCache[turnHash]) {
      return contextCache[turnHash].data;
    }

    // Skip if already loading
    if (contextLoadingStates[turnHash]) {
      return null;
    }

    // Mark as loading
    set({
      contextLoadingStates: { ...contextLoadingStates, [turnHash]: true },
    });

    try {
      const contextData = await api.fetchTurnContext(turnHash, {
        before: 1,
        after: 1,
        highlightStart: sentence.source?.start_char,
        highlightEnd: sentence.source?.end_char,
      });

      // Cache the result
      set((state) => ({
        contextCache: {
          ...state.contextCache,
          [turnHash]: { data: contextData, loadedAt: new Date() },
        },
        contextLoadingStates: {
          ...state.contextLoadingStates,
          [turnHash]: false,
        },
      }));

      return contextData;
    } catch {
      // Mark as not loading on error
      set((state) => ({
        contextLoadingStates: {
          ...state.contextLoadingStates,
          [turnHash]: false,
        },
      }));
      return null;
    }
  },

  getMergeChecks: (): MergeCheck[] => {
    const { prepared, message, targetBranch, serverChecks } = get();
    const unresolvedCount = get().getUnresolvedCount();
    const previewSentences = get().getPreviewSentences();
    const dev = useSettingsStore.getState().developerMode;
    const tm = (key: TermKey) => getTerminology(key, dev);

    const frontendChecks: MergeCheck[] = [
      {
        id: 'resolved',
        label: 'All conflicts resolved',
        passed: unresolvedCount === 0,
        detail: unresolvedCount > 0 ? `${unresolvedCount} unresolved` : undefined,
        source: 'frontend',
      },
      {
        id: 'message',
        label: `${tm('merge')} message provided`,
        passed: message.trim().length > 0,
        source: 'frontend',
      },
      {
        id: 'sentences',
        label: 'Result has sentences',
        passed: previewSentences.length > 0,
        detail:
          previewSentences.length > 0
            ? `${previewSentences.length} sentences`
            : 'No sentences in result',
        source: 'frontend',
      },
      {
        id: 'target_branch',
        label: `Target ${tm('branch').toLowerCase()} identified`,
        passed: !!targetBranch,
        detail: targetBranch || undefined,
        source: 'frontend',
      },
      {
        id: 'preview_computed',
        label: 'Preview computed',
        passed: true, // Always passes — informational
        detail: prepared
          ? `${prepared.identical.length} kept, ${prepared.similarPairs.length} conflicts, ${prepared.onlyInSource.length + prepared.onlyInTarget.length} unique`
          : undefined,
        source: 'frontend',
      },
    ];

    // Append server-side checks (advisory: failed server checks don't block merge)
    const taggedServerChecks = serverChecks.map((c) => ({ ...c, source: 'server' as const }));
    return [...frontendChecks, ...taggedServerChecks];
  },

  getEffectiveResolution: (index: number) => {
    const { prepared, extendedResolutions } = get();
    if (!prepared || index >= prepared.similarPairs.length) return null;

    const pair = prepared.similarPairs[index];
    const key = String(index);
    const extRes = extendedResolutions[key];

    // Standard resolution takes precedence if set
    if (pair.resolution) {
      return pair.resolution;
    }

    // Check extended resolution
    if (extRes) {
      return extRes.type;
    }

    return null;
  },
}));
