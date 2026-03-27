/**
 * Merge Workspace Store
 *
 * Zustand store for managing the full-screen merge workspace state.
 * Handles draft persistence, auto-save, and user decisions.
 *
 * Tree-primary: uses MergeResult (path-based conflicts).
 */

import type { MergeResult, TreeNode } from '@t3x-dev/core';
import { create } from 'zustand';
import type { FrameResolution } from '@/components/merge/FrameConflictCard';
import { getTerminology, type TermKey } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { API_V1, fetchWithTimeout, handleResponse } from '@/lib/api/core';
import { useSettingsStore } from '@/store/settingsStore';
import type { Merge2WayResult, MergeDraft, Sentence, TurnContextData } from '@/types/merge';
import { useCanvasStore } from './canvasStore';

// ============================================================================
// Types
// ============================================================================

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Extended resolution types for WebUI layer
 * Core MergeResult conflict resolution only supports 'source' | 'target'
 * We store extended resolutions separately and map at commit time
 */
export type ExtendedResolutionType = 'both';

export interface ExtendedResolutionData {
  type: ExtendedResolutionType;
}

/**
 * Check if a conflict at given index is resolved
 */
export function isConflictResolved(
  resolution: 'source' | 'target' | undefined,
  extRes: ExtendedResolutionData | undefined
): boolean {
  if (resolution) return true;
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
  // Draft data (legacy alias)
  /** @deprecated Use frameMergeResult. Kept for backward compat. */
  prepared: Merge2WayResult | null;

  draftId: string | null;
  projectId: string | null;
  sourceHash: string | null;
  targetHash: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
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
  // Key: conflict index as string, Value: extended resolution data
  extendedResolutions: Record<string, ExtendedResolutionData>;
  // Key: turn_hash, Value: cached context data
  contextCache: Record<string, CachedTurnContext>;
  // Key: turn_hash, Value: loading state
  contextLoadingStates: Record<string, boolean>;

  // Server-side merge checks (from backend API)
  serverChecks: MergeCheck[];
  serverChecksLoading: boolean;
  serverChecksError: string | null;

  // Tree-primary merge state
  frameMergeResult: MergeResult | null;
  /** Map of conflict path → resolution */
  frameResolutions: Map<string, FrameResolution>;
  /** Set of source-only paths to keep */
  keepSourceFrames: Set<string>;
  /** Set of target-only paths to keep */
  keepTargetFrames: Set<string>;

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
  setMessage: (message: string) => void;
  saveDraft: () => Promise<void>;
  commitMerge: (branch?: string) => Promise<{ hash: string }>;
  cancelMerge: () => Promise<void>;
  reset: () => void;

  // Preview actions
  togglePreview: () => void;

  // Legacy sentence-based actions (kept for UI compat)
  resolvePair: (index: number, pick: 'source' | 'target') => void;
  toggleKeep: (side: 'source' | 'target', index: number) => void;
  fetchSourceContext: (turnHash: string, sentence: Sentence) => Promise<TurnContextData | null>;
  getPreviewSentences: () => Sentence[];

  // Extended resolution actions
  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => void;
  getEffectiveResolution: (index: number) => 'source' | 'target' | 'both' | null;

  // Frame merge actions
  setFrameMergeResult: (result: MergeResult) => void;
  resolveFrameConflict: (path: string, resolution: FrameResolution) => void;
  toggleKeepSourceFrame: (path: string) => void;
  toggleKeepTargetFrame: (path: string) => void;
  allFrameConflictsResolved: () => boolean;

  // Computed getters
  getUnresolvedCount: () => number;
  getResolutionStats: () => ResolutionStats;
  canCommit: () => boolean;
  getMergeChecks: () => MergeCheck[];

  // Frame-aware computed getters
  getFrameUnresolvedCount: () => number;
  canCommitAny: () => boolean;
  getFrameMergeChecks: () => MergeCheck[];
  getPreviewPaths: () => string[];
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

// Convert API response (snake_case) to internal format (camelCase)
function apiDraftToInternal(apiDraft: Record<string, unknown>): {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  frameMergeResult: MergeResult | null;
  status: MergeDraft['status'];
  message: string | null;
} {
  const prepared = apiDraft.prepared as MergeResult | undefined;
  return {
    draftId: apiDraft.draftId as string,
    projectId: apiDraft.projectId as string,
    sourceHash: apiDraft.sourceHash as string,
    targetHash: apiDraft.targetHash as string,
    sourceBranch: (apiDraft.sourceBranch as string) || null,
    targetBranch: (apiDraft.targetBranch as string) || null,
    frameMergeResult: prepared ?? null,
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
  prepared: null as Merge2WayResult | null,
  frameMergeResult: null as MergeResult | null,
  frameResolutions: new Map<string, FrameResolution>(),
  keepSourceFrames: new Set<string>(),
  keepTargetFrames: new Set<string>(),
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
        frameMergeResult: draft.frameMergeResult,
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
        frameMergeResult: draft.frameMergeResult,
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

  setMessage: (message: string) => {
    set({ message, isDirty: true });
  },

  saveDraft: async () => {
    const { draftId, frameMergeResult, message, isDirty, status } = get();
    if (!draftId || !isDirty || status === 'committed') return;

    set({ saveStatus: 'saving' });

    try {
      await fetchApi(`/merge/drafts/${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({ prepared: frameMergeResult, message }),
      });

      set({
        saveStatus: 'saved',
        isDirty: false,
        lastSavedAt: new Date(),
      });

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
      set({ saveStatus: 'error' });
      console.warn('[MergeWorkspace] Auto-save failed:', errorMsg);
    }
  },

  commitMerge: async (branch?: string) => {
    const { draftId, message, targetBranch } = get();
    if (!draftId) throw new Error('No draft to commit');

    set({ error: null });

    try {
      const commitResult = await fetchApi<{ hash: string }>(`/merge/drafts/${draftId}/commit`, {
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
  // Legacy Sentence-Based Actions (kept for UI compat)
  // ============================================================================

  resolvePair: (index: number, pick: 'source' | 'target') => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return;

    const newPrepared = { ...prepared };
    newPrepared.similarPairs = [...prepared.similarPairs];
    newPrepared.similarPairs[index] = {
      ...newPrepared.similarPairs[index],
      resolution: pick,
    };

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

  fetchSourceContext: async (turnHash: string, sentence: Sentence) => {
    const { contextCache, contextLoadingStates } = get();

    if (contextCache[turnHash]) {
      return contextCache[turnHash].data;
    }

    if (contextLoadingStates[turnHash]) {
      return null;
    }

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
      set((state) => ({
        contextLoadingStates: {
          ...state.contextLoadingStates,
          [turnHash]: false,
        },
      }));
      return null;
    }
  },

  getPreviewSentences: (): Sentence[] => {
    const { prepared, extendedResolutions } = get();
    if (!prepared) return [];

    const sentences: Sentence[] = [];

    sentences.push(...prepared.identical);

    for (let i = 0; i < prepared.similarPairs.length; i++) {
      const pair = prepared.similarPairs[i];
      const key = String(i);
      const extRes = extendedResolutions[key];

      if (pair.resolution === 'source') {
        sentences.push(pair.source);
      } else if (pair.resolution === 'target') {
        sentences.push(pair.target);
      } else if (extRes?.type === 'both') {
        sentences.push(pair.source);
        sentences.push(pair.target);
      }
    }

    for (const candidate of prepared.onlyInSource) {
      if (candidate.keep) {
        sentences.push(candidate.sentence);
      }
    }

    for (const candidate of prepared.onlyInTarget) {
      if (candidate.keep) {
        sentences.push(candidate.sentence);
      }
    }

    return sentences;
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
  // Frame Merge Actions (tree-primary, path-based)
  // ============================================================================

  setFrameMergeResult: (result: MergeResult) => {
    // Initialize keepSource/keepTarget with all source-only/target-only paths kept by default
    const keepSource = new Set(result.onlyInSource);
    const keepTarget = new Set(result.onlyInTarget);
    set({
      frameMergeResult: result,
      frameResolutions: new Map(),
      keepSourceFrames: keepSource,
      keepTargetFrames: keepTarget,
    });
  },

  resolveFrameConflict: (path: string, resolution: FrameResolution) => {
    const prev = get().frameResolutions;
    const next = new Map(prev);
    next.set(path, resolution);
    set({ frameResolutions: next, isDirty: true });
  },

  toggleKeepSourceFrame: (path: string) => {
    const prev = get().keepSourceFrames;
    const next = new Set(prev);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ keepSourceFrames: next, isDirty: true });
  },

  toggleKeepTargetFrame: (path: string) => {
    const prev = get().keepTargetFrames;
    const next = new Set(prev);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ keepTargetFrames: next, isDirty: true });
  },

  allFrameConflictsResolved: () => {
    const { frameMergeResult, frameResolutions } = get();
    if (!frameMergeResult) return true;
    return frameMergeResult.conflicts.every((c: { path: string }) => frameResolutions.has(c.path));
  },

  // ============================================================================
  // Computed Getters
  // ============================================================================

  getUnresolvedCount: () => {
    const { frameMergeResult, frameResolutions, extendedResolutions } = get();
    if (!frameMergeResult) return 0;

    let count = 0;
    for (let i = 0; i < frameMergeResult.conflicts.length; i++) {
      const conflict = frameMergeResult.conflicts[i];
      const resolution = frameResolutions.get(conflict.path);
      const extRes = extendedResolutions[String(i)];

      if (!resolution && !extRes) {
        count++;
      }
    }
    return count;
  },

  getResolutionStats: (): ResolutionStats => {
    const { frameMergeResult, frameResolutions, extendedResolutions } = get();
    if (!frameMergeResult) return { standard: 0, both: 0, unresolved: 0 };

    const stats: ResolutionStats = { standard: 0, both: 0, unresolved: 0 };

    for (let i = 0; i < frameMergeResult.conflicts.length; i++) {
      const conflict = frameMergeResult.conflicts[i];
      const resolution = frameResolutions.get(conflict.path);
      const extRes = extendedResolutions[String(i)];

      if (resolution) {
        if (resolution.type === 'both') {
          stats.both++;
        } else {
          stats.standard++;
        }
      } else if (extRes?.type === 'both') {
        stats.both++;
      } else {
        stats.unresolved++;
      }
    }

    return stats;
  },

  canCommit: () => {
    const { frameMergeResult, message, status } = get();
    if (!frameMergeResult || status !== 'pending') return false;
    if (!message.trim()) return false;

    return get().getUnresolvedCount() === 0;
  },

  getMergeChecks: (): MergeCheck[] => {
    const { frameMergeResult, message, targetBranch, serverChecks } = get();
    const unresolvedCount = get().getUnresolvedCount();
    const previewPaths = get().getPreviewPaths();
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
        id: 'nodes',
        label: 'Result has nodes',
        passed: previewPaths.length > 0,
        detail:
          previewPaths.length > 0
            ? `${previewPaths.length} nodes`
            : 'No nodes in result',
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
        passed: true,
        detail: frameMergeResult
          ? `${frameMergeResult.autoKept.length} kept, ${frameMergeResult.conflicts.length} conflicts, ${frameMergeResult.onlyInSource.length + frameMergeResult.onlyInTarget.length} unique`
          : undefined,
        source: 'frontend',
      },
    ];

    const taggedServerChecks = serverChecks.map((c: MergeCheck) => ({ ...c, source: 'server' as const }));
    return [...frontendChecks, ...taggedServerChecks];
  },

  // ============================================================================
  // Extended Resolution Actions
  // ============================================================================

  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => {
    const { frameMergeResult, frameResolutions, extendedResolutions } = get();
    if (!frameMergeResult || index >= frameMergeResult.conflicts.length) return;

    const conflict = frameMergeResult.conflicts[index];
    const key = String(index);

    if (resolution === 'source' || resolution === 'target') {
      const newResolutions = new Map(frameResolutions);
      newResolutions.set(conflict.path, { type: resolution } as FrameResolution);

      const newExtended = { ...extendedResolutions };
      delete newExtended[key];
      set({ frameResolutions: newResolutions, extendedResolutions: newExtended, isDirty: true });
    } else {
      // Extended resolution (both)
      const newResolutions = new Map(frameResolutions);
      newResolutions.delete(conflict.path);

      const newExtended = { ...extendedResolutions };
      newExtended[key] = { type: 'both' };
      set({ frameResolutions: newResolutions, extendedResolutions: newExtended, isDirty: true });
    }
  },

  getEffectiveResolution: (index: number) => {
    const { frameMergeResult, frameResolutions, extendedResolutions } = get();
    if (!frameMergeResult || index >= frameMergeResult.conflicts.length) return null;

    const conflict = frameMergeResult.conflicts[index];
    const resolution = frameResolutions.get(conflict.path);
    const key = String(index);
    const extRes = extendedResolutions[key];

    if (resolution) {
      return resolution.type === 'both' ? 'both' : resolution.type as 'source' | 'target';
    }
    if (extRes) {
      return extRes.type;
    }
    return null;
  },

  // ============================================================================
  // Frame-Aware Computed Getters
  // ============================================================================

  getFrameUnresolvedCount: () => {
    const { frameMergeResult, frameResolutions } = get();
    if (!frameMergeResult) return 0;
    return frameMergeResult.conflicts.filter((c: { path: string }) => !frameResolutions.has(c.path)).length;
  },

  canCommitAny: () => {
    const { message } = get();
    if (!message.trim()) return false;
    return get().allFrameConflictsResolved();
  },

  getFrameMergeChecks: (): MergeCheck[] => {
    const { frameMergeResult, message, targetBranch } = get();
    const dev = useSettingsStore.getState().developerMode;
    const tm = (key: TermKey) => getTerminology(key, dev);

    if (!frameMergeResult) return get().getMergeChecks();

    const unresolvedCount = get().getFrameUnresolvedCount();
    const previewPaths = get().getPreviewPaths();

    const checks: MergeCheck[] = [
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
        id: 'frames',
        label: 'Result has nodes',
        passed: previewPaths.length > 0,
        detail: previewPaths.length > 0 ? `${previewPaths.length} nodes` : 'No nodes in result',
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
        passed: true,
        detail: `${frameMergeResult.autoKept.length} auto-kept, ${frameMergeResult.conflicts.length} conflicts, ${frameMergeResult.onlyInSource.length + frameMergeResult.onlyInTarget.length} unique`,
        source: 'frontend',
      },
    ];

    return checks;
  },

  getPreviewPaths: (): string[] => {
    const { frameMergeResult, frameResolutions, keepSourceFrames, keepTargetFrames } = get();
    if (!frameMergeResult) return [];

    const paths: string[] = [];

    // Auto-kept
    paths.push(...frameMergeResult.autoKept);

    // Resolved conflicts
    for (const conflict of frameMergeResult.conflicts) {
      const resolution = frameResolutions.get(conflict.path);
      if (!resolution) continue;

      switch (resolution.type) {
        case 'source':
        case 'target':
          paths.push(conflict.path);
          break;
        case 'both':
          paths.push(conflict.path);
          break;
      }
    }

    // Source-only (kept)
    for (const path of frameMergeResult.onlyInSource) {
      if (keepSourceFrames.has(path)) {
        paths.push(path);
      }
    }

    // Target-only (kept)
    for (const path of frameMergeResult.onlyInTarget) {
      if (keepTargetFrames.has(path)) {
        paths.push(path);
      }
    }

    return paths;
  },
}));
