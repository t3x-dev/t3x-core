/**
 * Merge Workspace Store
 *
 * Zustand store for managing the full-screen merge workspace state.
 * Handles draft persistence, auto-save, and user decisions.
 */

import { create } from 'zustand';
import * as api from '@/lib/api';
import type {
  CommitV3,
  Merge2WayResult,
  MergeDraft,
  Sentence,
  TurnContextData,
} from '@/types/merge';
import { useCanvasStore } from './canvasStore';
import { API_V1 } from './canvasStoreUtils';

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

  // Context modal state
  contextModalOpen: boolean;
  contextSentence: Sentence | null;
  contextData: TurnContextData | null;
  contextLoading: boolean;

  // Preview state
  previewExpanded: boolean;

  // Extended resolution state (WebUI layer only)
  // Key: pair index as string, Value: extended resolution data
  extendedResolutions: Record<string, ExtendedResolutionData>;
  // Key: turn_hash, Value: cached context data
  contextCache: Record<string, CachedTurnContext>;
  // Key: turn_hash, Value: loading state
  contextLoadingStates: Record<string, boolean>;

  // Actions
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

  // Context modal actions
  openContext: (sentence: Sentence) => Promise<void>;
  closeContext: () => void;

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
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_V1}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data as T;
}

// ============================================================================
// Data Transformation: API (source_ref) → Frontend (source)
// ============================================================================

/**
 * Transform a sentence from API format (source_ref) to frontend format (source)
 * API uses DiffableSentence.source_ref, frontend uses Sentence.source
 */
interface ApiSentence {
  id: string;
  text: string;
  source_ref?: {
    conversation_id?: string;
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

function transformSentence(apiSentence: ApiSentence): Sentence {
  return {
    id: apiSentence.id,
    text: apiSentence.text,
    source: apiSentence.source_ref
      ? {
          turn_hash: apiSentence.source_ref.turn_hash,
          start_char: apiSentence.source_ref.start_char,
          end_char: apiSentence.source_ref.end_char,
        }
      : undefined,
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
      sourceConstraints: [],
      targetConstraints: [],
    })),
    onlyInSource: prepared.onlyInSource.map((item) => ({
      sentence: transformSentence(item.sentence),
      constraints: [],
      keep: item.keep,
    })),
    onlyInTarget: prepared.onlyInTarget.map((item) => ({
      sentence: transformSentence(item.sentence),
      constraints: [],
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
  contextModalOpen: false,
  contextSentence: null,
  contextData: null,
  contextLoading: false,
  previewExpanded: false,
  extendedResolutions: {} as Record<string, ExtendedResolutionData>,
  contextCache: {} as Record<string, CachedTurnContext>,
  contextLoadingStates: {} as Record<string, boolean>,
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
    const { draftId, prepared, message, isDirty } = get();
    if (!draftId || !isDirty) return;

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
      setTimeout(() => {
        const current = get();
        if (current.saveStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save';
      set({ saveStatus: 'error', error: errorMsg });
    }
  },

  commitMerge: async (branch?: string) => {
    const { draftId, message, targetBranch } = get();
    if (!draftId) throw new Error('No draft to commit');

    set({ loading: true, error: null });

    try {
      const commitResult = await fetchApi<CommitV3>(`/merge/drafts/${draftId}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          branch: branch || targetBranch || 'main',
        }),
      });

      set({ status: 'committed', loading: false });

      // Force canvas to reload data by clearing its projectId
      // This ensures the new merge commit will be displayed
      const projectId = get().projectId;
      if (projectId) {
        useCanvasStore.getState().loadProjectData(projectId);
      }

      return commitResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
      set({ loading: false, error: errorMsg });
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
    set(initialState);
  },

  // ============================================================================
  // Context Modal Actions
  // ============================================================================

  openContext: async (sentence: Sentence) => {
    // Check if source and turn_hash are available for source tracing
    if (!sentence.source?.turn_hash) {
      set({
        contextModalOpen: true,
        contextSentence: sentence,
        contextLoading: false,
        contextData: null,
        error: 'Source tracing not available for this sentence',
      });
      return;
    }

    set({
      contextModalOpen: true,
      contextSentence: sentence,
      contextLoading: true,
      contextData: null,
    });

    try {
      const turnHash = encodeURIComponent(sentence.source.turn_hash);
      const params = new URLSearchParams({
        before: '2',
        after: '2',
      });

      // Only add highlight params if available
      if (sentence.source.start_char !== undefined) {
        params.set('highlight_start', String(sentence.source.start_char));
      }
      if (sentence.source.end_char !== undefined) {
        params.set('highlight_end', String(sentence.source.end_char));
      }

      const contextData = await fetchApi<TurnContextData>(`/turns/${turnHash}/context?${params}`);

      set({ contextData, contextLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
      set({ contextLoading: false, error: errorMsg });
    }
  },

  closeContext: () => {
    set({
      contextModalOpen: false,
      contextSentence: null,
      contextData: null,
    });
  },

  // ============================================================================
  // Preview Actions
  // ============================================================================

  togglePreview: () => {
    set((state) => ({ previewExpanded: !state.previewExpanded }));
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
