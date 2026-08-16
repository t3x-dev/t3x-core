/**
 * Merge Workspace Store — passive.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (load, create, save, commit, cancel, fetchSourceContext,
 * fetchServerChecks) live in `hooks/useMergeWorkspaceActions`.
 * This store owns:
 *  - merge workspace state (draft fields, conflicts, resolutions, cache)
 *  - pure local mutations (resolveConflict, toggleKeepSource, etc.)
 *  - pure computed getters (getMergeChecks, canCommit, ...)
 *  - passive setters the hook calls after each I/O resolves
 */

import type { MergeDecision, MergeResult } from '@t3x-dev/core';
import { create } from 'zustand';
import { getTerminology, type TermKey } from '@/hooks/shared/useTerminology';
import { isDeveloperMode } from '@/store/shared';
import {
  isTreeResolutionComplete,
  type MergeDraft,
  type TreeResolution,
  type TurnContextData,
} from '@/types/merge';
import type { SaveStatus } from './saveStatus';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended resolution types for WebUI layer.
 * Core MergeResult conflict resolution only supports 'source' | 'target';
 * extended resolutions are stored separately and mapped at commit time.
 */
export type ExtendedResolutionType = 'both';

export interface ExtendedResolutionData {
  type: ExtendedResolutionType;
}

export function isConflictResolved(
  resolution: 'source' | 'target' | undefined,
  extRes: ExtendedResolutionData | undefined
): boolean {
  if (resolution) return true;
  if (extRes?.type === 'both') return true;
  return false;
}

export interface ResolutionStats {
  standard: number;
  both: number;
  unresolved: number;
}

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
  decisionRevision: number;
  localRevision: number;

  // UI state
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  lastSavedAt: Date | null;
  isDirty: boolean;

  // Preview state
  previewExpanded: boolean;

  // Extended resolution state (WebUI layer only)
  extendedResolutions: Record<string, ExtendedResolutionData>;
  contextCache: Record<string, CachedTurnContext>;
  contextLoadingStates: Record<string, boolean>;

  // Server-side merge checks
  serverChecks: MergeCheck[];
  serverChecksLoading: boolean;
  serverChecksError: string | null;

  // Tree-primary merge state
  treeMergeResult: MergeResult | null;
  treeResolutions: Map<string, TreeResolution>;
  keepSourceNodes: Set<string>;
  keepTargetNodes: Set<string>;

  // ── Pure mutations ──
  setMessage: (message: string) => void;
  togglePreview: () => void;
  resolveConflict: (index: number, resolution: 'source' | 'target' | 'both') => void;
  getEffectiveResolution: (index: number) => 'source' | 'target' | 'both' | null;
  setTreeMergeResult: (result: MergeResult) => void;
  resolveTreeConflict: (path: string, resolution: TreeResolution) => void;
  toggleKeepSourceNode: (path: string) => void;
  toggleKeepTargetNode: (path: string) => void;
  allTreeConflictsResolved: () => boolean;

  // ── Passive setters used by useMergeWorkspaceActions ──
  setLoading: () => void;
  setLoadError: (message: string) => void;
  setDraftLoaded: (draft: {
    draftId: string;
    projectId: string;
    sourceHash: string;
    targetHash: string;
    sourceBranch?: string | null;
    targetBranch?: string | null;
    prepared?: MergeResult | null;
    decisions?: MergeDecision | null;
    decisionRevision: number;
    status: MergeDraft['status'];
    message?: string | null;
  }) => void;
  setSaveStarted: () => void;
  setSaveSucceeded: (decisionRevision: number, savedLocalRevision: number) => void;
  setSaveFailed: () => void;
  setSaveStatusIdle: () => void;
  clearError: () => void;
  setCommitFailed: (message: string) => void;
  setCommitted: () => void;
  setContextLoading: (turnHash: string, loading: boolean) => void;
  setContextCached: (turnHash: string, data: TurnContextData) => void;
  setServerChecksLoading: () => void;
  setServerChecksSucceeded: (checks: MergeCheck[]) => void;
  setServerChecksFailed: (message: string) => void;

  // ── Pure computed getters ──
  getUnresolvedCount: () => number;
  getResolutionStats: () => ResolutionStats;
  canCommit: () => boolean;
  getMergeChecks: () => MergeCheck[];
  getTreeUnresolvedCount: () => number;
  getTreeMergeChecks: () => MergeCheck[];
  getPreviewPaths: () => string[];

  // Lifecycle
  reset: () => void;
}

export interface MergeCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
  /** 'frontend' checks gate merge; 'server' checks are advisory only */
  source?: 'frontend' | 'server';
}

const initialState = {
  draftId: null,
  projectId: null,
  sourceHash: null,
  targetHash: null,
  sourceBranch: null,
  targetBranch: null,
  message: '',
  status: null,
  decisionRevision: 0,
  localRevision: 0,
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

  // ── Pure mutations ──

  setMessage: (message: string) =>
    set((state) => ({ message, isDirty: true, localRevision: state.localRevision + 1 })),

  togglePreview: () => set((state) => ({ previewExpanded: !state.previewExpanded })),

  resolveConflict: (index, resolution) => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult || index >= treeMergeResult.conflicts.length) return;

    const conflict = treeMergeResult.conflicts[index];
    const key = String(index);

    if (resolution === 'source' || resolution === 'target') {
      const newResolutions = new Map(treeResolutions);
      newResolutions.set(conflict.path, { type: resolution } as TreeResolution);
      const newExtended = { ...extendedResolutions };
      delete newExtended[key];
      set((state) => ({
        treeResolutions: newResolutions,
        extendedResolutions: newExtended,
        isDirty: true,
        localRevision: state.localRevision + 1,
      }));
    } else {
      const newResolutions = new Map(treeResolutions);
      newResolutions.delete(conflict.path);
      const newExtended = { ...extendedResolutions };
      newExtended[key] = { type: 'both' };
      set((state) => ({
        treeResolutions: newResolutions,
        extendedResolutions: newExtended,
        isDirty: true,
        localRevision: state.localRevision + 1,
      }));
    }
  },

  getEffectiveResolution: (index) => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult || index >= treeMergeResult.conflicts.length) return null;

    const conflict = treeMergeResult.conflicts[index];
    const resolution = treeResolutions.get(conflict.path);
    const extRes = extendedResolutions[String(index)];

    if (
      resolution?.type === 'source' ||
      resolution?.type === 'target' ||
      resolution?.type === 'both'
    ) {
      return resolution.type;
    }
    if (extRes) {
      return extRes.type;
    }
    return null;
  },

  setTreeMergeResult: (result) => {
    const keepSource = new Set(result.onlyInSource);
    const keepTarget = new Set(result.onlyInTarget);
    set({
      treeMergeResult: result,
      treeResolutions: new Map(),
      extendedResolutions: {},
      keepSourceNodes: keepSource,
      keepTargetNodes: keepTarget,
    });
  },

  resolveTreeConflict: (path, resolution) => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    const next = new Map(treeResolutions);
    next.set(path, resolution);
    const nextExtended = { ...extendedResolutions };
    const conflictIndex = treeMergeResult?.conflicts.findIndex(
      (conflict) => conflict.path === path
    );
    if (conflictIndex !== undefined && conflictIndex >= 0) {
      delete nextExtended[String(conflictIndex)];
    }
    set((state) => ({
      treeResolutions: next,
      extendedResolutions: nextExtended,
      isDirty: true,
      localRevision: state.localRevision + 1,
    }));
  },

  toggleKeepSourceNode: (path) => {
    const next = new Set(get().keepSourceNodes);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set((state) => ({
      keepSourceNodes: next,
      isDirty: true,
      localRevision: state.localRevision + 1,
    }));
  },

  toggleKeepTargetNode: (path) => {
    const next = new Set(get().keepTargetNodes);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set((state) => ({
      keepTargetNodes: next,
      isDirty: true,
      localRevision: state.localRevision + 1,
    }));
  },

  allTreeConflictsResolved: () => {
    const { treeMergeResult, treeResolutions } = get();
    if (!treeMergeResult) return true;
    return treeMergeResult.conflicts.every((conflict) =>
      isTreeResolutionComplete(treeResolutions.get(conflict.path), conflict.slotConflicts)
    );
  },

  // ── Passive setters ──

  setLoading: () => set({ loading: true, error: null }),
  setLoadError: (message) => set({ loading: false, error: message }),

  setDraftLoaded: (draft) => {
    const prepared = draft.prepared ?? null;
    const treeResolutions = new Map<string, TreeResolution>();
    for (const [path, resolution] of Object.entries(draft.decisions?.conflictResolutions ?? {})) {
      if (resolution === 'source' || resolution === 'target' || resolution === 'both') {
        treeResolutions.set(path, { type: resolution });
      } else if (typeof resolution === 'object' && resolution !== null && 'edit' in resolution) {
        treeResolutions.set(path, { type: 'edit', edit: resolution.edit });
      }
    }
    set({
      draftId: draft.draftId,
      projectId: draft.projectId,
      sourceHash: draft.sourceHash,
      targetHash: draft.targetHash,
      sourceBranch: draft.sourceBranch,
      targetBranch: draft.targetBranch,
      treeMergeResult: prepared,
      treeResolutions,
      keepSourceNodes: new Set(draft.decisions?.keepFromSource ?? prepared?.onlyInSource ?? []),
      keepTargetNodes: new Set(draft.decisions?.keepFromTarget ?? prepared?.onlyInTarget ?? []),
      extendedResolutions: {},
      status: draft.status,
      decisionRevision: draft.decisionRevision,
      localRevision: 0,
      message: draft.message || '',
      loading: false,
      isDirty: false,
    });
  },

  setSaveStarted: () => set({ saveStatus: 'saving' }),
  setSaveSucceeded: (decisionRevision, savedLocalRevision) => {
    set((state) => ({
      saveStatus: 'saved',
      decisionRevision,
      isDirty: state.localRevision !== savedLocalRevision,
      lastSavedAt: new Date(),
    }));
  },
  setSaveFailed: () => set({ saveStatus: 'error' }),
  /** Reset saveStatus to 'idle' — driven by useSaveStatusAutoIdle. */
  setSaveStatusIdle: () => set({ saveStatus: 'idle' }),

  clearError: () => set({ error: null }),

  setCommitFailed: (message) => set({ error: message }),

  setCommitted: () =>
    set({
      status: 'committed',
      isDirty: false,
      extendedResolutions: {},
      contextCache: {},
      contextLoadingStates: {},
    }),

  setContextLoading: (turnHash, loading) =>
    set((state) => ({
      contextLoadingStates: { ...state.contextLoadingStates, [turnHash]: loading },
    })),

  setContextCached: (turnHash, data) =>
    set((state) => ({
      contextCache: {
        ...state.contextCache,
        [turnHash]: { data, loadedAt: new Date() },
      },
      contextLoadingStates: { ...state.contextLoadingStates, [turnHash]: false },
    })),

  setServerChecksLoading: () => set({ serverChecksLoading: true, serverChecksError: null }),
  setServerChecksSucceeded: (checks) => set({ serverChecks: checks, serverChecksLoading: false }),
  setServerChecksFailed: (message) =>
    set({ serverChecksLoading: false, serverChecksError: message }),

  // ── Pure computed getters ──

  getUnresolvedCount: () => {
    const { treeMergeResult, treeResolutions, extendedResolutions } = get();
    if (!treeMergeResult) return 0;

    let count = 0;
    for (let i = 0; i < treeMergeResult.conflicts.length; i++) {
      const conflict = treeMergeResult.conflicts[i];
      const resolution = treeResolutions.get(conflict.path);
      const extRes = extendedResolutions[String(i)];
      if (!isTreeResolutionComplete(resolution, conflict.slotConflicts) && !extRes) count++;
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
      if (isTreeResolutionComplete(resolution, conflict.slotConflicts) && resolution) {
        if (resolution.type === 'both') stats.both++;
        else stats.standard++;
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
    const dev = isDeveloperMode();
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
        detail: treeMergeResult
          ? `${treeMergeResult.autoKept.length} kept, ${treeMergeResult.conflicts.length} conflicts, ${treeMergeResult.onlyInSource.length + treeMergeResult.onlyInTarget.length} unique`
          : undefined,
        source: 'frontend',
      },
    ];

    const taggedServerChecks = serverChecks.map((c: MergeCheck) => ({
      ...c,
      source: 'server' as const,
    }));
    return [...frontendChecks, ...taggedServerChecks];
  },

  getTreeUnresolvedCount: () => {
    const { treeMergeResult, treeResolutions } = get();
    if (!treeMergeResult) return 0;
    return treeMergeResult.conflicts.filter(
      (conflict) =>
        !isTreeResolutionComplete(treeResolutions.get(conflict.path), conflict.slotConflicts)
    ).length;
  },

  getTreeMergeChecks: (): MergeCheck[] => {
    const { treeMergeResult, message, targetBranch } = get();
    const dev = isDeveloperMode();
    const tm = (key: TermKey) => getTerminology(key, dev);

    if (!treeMergeResult) return get().getMergeChecks();

    const unresolvedCount = get().getTreeUnresolvedCount();
    const previewPaths = get().getPreviewPaths();

    return [
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
  },

  getPreviewPaths: (): string[] => {
    const { treeMergeResult, treeResolutions, keepSourceNodes, keepTargetNodes } = get();
    if (!treeMergeResult) return [];

    const paths: string[] = [];
    paths.push(...treeMergeResult.autoKept);

    for (const conflict of treeMergeResult.conflicts) {
      const resolution = treeResolutions.get(conflict.path);
      if (!isTreeResolutionComplete(resolution, conflict.slotConflicts) || !resolution) continue;
      switch (resolution.type) {
        case 'source':
        case 'target':
        case 'both':
        case 'edit':
        case 'per-slot':
          paths.push(conflict.path);
          break;
      }
    }

    for (const path of treeMergeResult.onlyInSource) {
      if (keepSourceNodes.has(path)) paths.push(path);
    }
    for (const path of treeMergeResult.onlyInTarget) {
      if (keepTargetNodes.has(path)) paths.push(path);
    }

    return paths;
  },

  reset: () => {
    set(initialState);
  },
}));
