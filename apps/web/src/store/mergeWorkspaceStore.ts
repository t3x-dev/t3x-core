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
import type { TreeResolution } from '@/components/merge/ConflictCard';
import { getTerminology, type TermKey } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { API_V1, fetchWithTimeout, handleResponse } from '@/lib/api/core';
import { useSettingsStore } from '@/store/settingsStore';
import type { ContentNode, MergeDraft, TurnContextData } from '@/types/merge';
import { type SaveStatus, createSaveStatusTimer } from './saveStatus';

// ============================================================================
// Types
// ============================================================================

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
  treeMergeResult: MergeResult | null;
  /** Map of conflict path → resolution */
  treeResolutions: Map<string, TreeResolution>;
  /** Set of source-only paths to keep */
  keepSourceNodes: Set<string>;
  /** Set of target-only paths to keep */
  keepTargetNodes: Set<string>;

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

  // Source context for merge conflicts
  fetchSourceContext: (turnHash: string, node: ContentNode) => Promise<TurnContextData | null>;

  // Extended resolution actions
  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => void;
  getEffectiveResolution: (index: number) => 'source' | 'target' | 'both' | null;

  // Tree merge actions
  setTreeMergeResult: (result: MergeResult) => void;
  resolveTreeConflict: (path: string, resolution: TreeResolution) => void;
  toggleKeepSourceNode: (path: string) => void;
  toggleKeepTargetNode: (path: string) => void;
  allTreeConflictsResolved: () => boolean;

  // Computed getters
  getUnresolvedCount: () => number;
  getResolutionStats: () => ResolutionStats;
  canCommit: () => boolean;
  getMergeChecks: () => MergeCheck[];

  // Tree-aware computed getters
  getTreeUnresolvedCount: () => number;
  getTreeMergeChecks: () => MergeCheck[];
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
  treeMergeResult: MergeResult | null;
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
    treeMergeResult: prepared ?? null,
    status: apiDraft.status as MergeDraft['status'],
    message: (apiDraft.message as string) || null,
  };
}

const saveTimer = createSaveStatusTimer();

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
  treeMergeResult: null as MergeResult | null,
  treeResolutions: new Map<string, TreeResolution>(),
  keepSourceNodes: new Set<string>(),
  keepTargetNodes: new Set<string>(),
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
        treeMergeResult: draft.treeMergeResult,
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
        treeMergeResult: draft.treeMergeResult,
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
    const { draftId, treeMergeResult, message, isDirty, status } = get();
    if (!draftId || !isDirty || status === 'committed') return;

    set({ saveStatus: 'saving' });

    try {
      await fetchApi(`/merge/drafts/${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({ prepared: treeMergeResult, message }),
      });

      set({
        saveStatus: 'saved',
        isDirty: false,
        lastSavedAt: new Date(),
      });

      saveTimer.scheduleReset(get, set);
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
    saveTimer.cancel();
    set(initialState);
  },

  // ============================================================================
  // Preview Actions
  // ============================================================================

  togglePreview: () => {
    set((state) => ({ previewExpanded: !state.previewExpanded }));
  },

  fetchSourceContext: async (turnHash: string, node: ContentNode) => {
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
        highlightStart: node.source?.start_char,
        highlightEnd: node.source?.end_char,
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
  // Tree Merge Actions (tree-primary, path-based)
  // ============================================================================

  setTreeMergeResult: (result: MergeResult) => {
    // Initialize keepSource/keepTarget with all source-only/target-only paths kept by default
    const keepSource = new Set(result.onlyInSource);
    const keepTarget = new Set(result.onlyInTarget);
    set({
      treeMergeResult: result,
      treeResolutions: new Map(),
      keepSourceNodes: keepSource,
      keepTargetNodes: keepTarget,
    });
  },

  resolveTreeConflict: (path: string, resolution: TreeResolution) => {
    const prev = get().treeResolutions;
    const next = new Map(prev);
    next.set(path, resolution);
    set({ treeResolutions: next, isDirty: true });
  },

  toggleKeepSourceNode: (path: string) => {
    const prev = get().keepSourceNodes;
    const next = new Set(prev);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ keepSourceNodes: next, isDirty: true });
  },

  toggleKeepTargetNode: (path: string) => {
    const prev = get().keepTargetNodes;
    const next = new Set(prev);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ keepTargetNodes: next, isDirty: true });
  },

  allTreeConflictsResolved: () => {
    const { treeMergeResult, treeResolutions } = get();
    if (!treeMergeResult) return true;
    return treeMergeResult.conflicts.every((c: { path: string }) => treeResolutions.has(c.path));
  },

  // ============================================================================
  // Computed Getters
  // ============================================================================

  getUnresolvedCount: () => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult) return 0;

    let count = 0;
    for (let i = 0; i < treeMergeResult.conflicts.length; i++) {
      const conflict = treeMergeResult.conflicts[i];
      const resolution = treeResolutions.get(conflict.path);
      const extRes = extendedResolutions[String(i)];

      if (!resolution && !extRes) {
        count++;
      }
    }
    return count;
  },

  getResolutionStats: (): ResolutionStats => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult) return { standard: 0, both: 0, unresolved: 0 };

    const stats: ResolutionStats = { standard: 0, both: 0, unresolved: 0 };

    for (let i = 0; i < treeMergeResult.conflicts.length; i++) {
      const conflict = treeMergeResult.conflicts[i];
      const resolution = treeResolutions.get(conflict.path);
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
    const { treeMergeResult, message, status } = get();
    if (!treeMergeResult || status !== 'pending') return false;
    if (!message.trim()) return false;

    return get().getUnresolvedCount() === 0;
  },

  getMergeChecks: (): MergeCheck[] => {
    const { treeMergeResult, message, targetBranch, serverChecks } = get();
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
        detail: treeMergeResult
          ? `${treeMergeResult.autoKept.length} kept, ${treeMergeResult.conflicts.length} conflicts, ${treeMergeResult.onlyInSource.length + treeMergeResult.onlyInTarget.length} unique`
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
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult || index >= treeMergeResult.conflicts.length) return;

    const conflict = treeMergeResult.conflicts[index];
    const key = String(index);

    if (resolution === 'source' || resolution === 'target') {
      const newResolutions = new Map(treeResolutions);
      newResolutions.set(conflict.path, { type: resolution } as TreeResolution);

      const newExtended = { ...extendedResolutions };
      delete newExtended[key];
      set({ treeResolutions: newResolutions, extendedResolutions: newExtended, isDirty: true });
    } else {
      // Extended resolution (both)
      const newResolutions = new Map(treeResolutions);
      newResolutions.delete(conflict.path);

      const newExtended = { ...extendedResolutions };
      newExtended[key] = { type: 'both' };
      set({ treeResolutions: newResolutions, extendedResolutions: newExtended, isDirty: true });
    }
  },

  getEffectiveResolution: (index: number) => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult || index >= treeMergeResult.conflicts.length) return null;

    const conflict = treeMergeResult.conflicts[index];
    const resolution = treeResolutions.get(conflict.path);
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
  // Tree-Aware Computed Getters
  // ============================================================================

  getTreeUnresolvedCount: () => {
    const { treeMergeResult, treeResolutions } = get();
    if (!treeMergeResult) return 0;
    return treeMergeResult.conflicts.filter((c: { path: string }) => !treeResolutions.has(c.path)).length;
  },

  getTreeMergeChecks: (): MergeCheck[] => {
    const { treeMergeResult, message, targetBranch } = get();
    const dev = useSettingsStore.getState().developerMode;
    const tm = (key: TermKey) => getTerminology(key, dev);

    if (!treeMergeResult) return get().getMergeChecks();

    const unresolvedCount = get().getTreeUnresolvedCount();
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
        id: 'trees',
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
        detail: `${treeMergeResult.autoKept.length} auto-kept, ${treeMergeResult.conflicts.length} conflicts, ${treeMergeResult.onlyInSource.length + treeMergeResult.onlyInTarget.length} unique`,
        source: 'frontend',
      },
    ];

    return checks;
  },

  getPreviewPaths: (): string[] => {
    const { treeMergeResult, treeResolutions, keepSourceNodes, keepTargetNodes } = get();
    if (!treeMergeResult) return [];

    const paths: string[] = [];

    // Auto-kept
    paths.push(...treeMergeResult.autoKept);

    // Resolved conflicts
    for (const conflict of treeMergeResult.conflicts) {
      const resolution = treeResolutions.get(conflict.path);
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
    for (const path of treeMergeResult.onlyInSource) {
      if (keepSourceNodes.has(path)) {
        paths.push(path);
      }
    }

    // Target-only (kept)
    for (const path of treeMergeResult.onlyInTarget) {
      if (keepTargetNodes.has(path)) {
        paths.push(path);
      }
    }

    return paths;
  },
}));
