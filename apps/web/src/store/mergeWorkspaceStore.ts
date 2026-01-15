/**
 * Merge Workspace Store
 *
 * Zustand store for managing the full-screen merge workspace state.
 * Handles draft persistence, auto-save, and user decisions.
 */

import { create } from 'zustand';
import type {
  MergeDraft,
  Merge2WayResult,
  TurnContextData,
  Sentence,
  CommitV3,
} from '@/types/merge';
import { useCanvasStore } from './canvasStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_V1 = `${API_BASE}/api/v1`;

// ============================================================================
// Types
// ============================================================================

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

  // Computed getters
  getUnresolvedCount: () => number;
  canCommit: () => boolean;
  getPreviewSentences: () => Sentence[];
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
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
    prepared: apiDraft.prepared as Merge2WayResult,
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
};

export const useMergeWorkspaceStore = create<MergeWorkspaceState>((set, get) => ({
  ...initialState,

  // ============================================================================
  // Draft Actions
  // ============================================================================

  loadDraft: async (draftId: string) => {
    set({ loading: true, error: null });

    try {
      const apiDraft = await fetchApi<Record<string, unknown>>(
        `/merge/drafts/${draftId}`
      );
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
      const apiDraft = await fetchApi<Record<string, unknown>>(
        '/merge/drafts',
        {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            source_hash: sourceHash,
            target_hash: targetHash,
            source_branch: sourceBranch,
            target_branch: targetBranch,
          }),
        }
      );
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
    const { prepared } = get();
    if (!prepared) return;

    const newPrepared = { ...prepared };
    newPrepared.similarPairs = [...prepared.similarPairs];
    newPrepared.similarPairs[index] = {
      ...newPrepared.similarPairs[index],
      resolution: pick,
    };

    set({ prepared: newPrepared, isDirty: true });
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
      const commitResult = await fetchApi<CommitV3>(
        `/merge/drafts/${draftId}/commit`,
        {
          method: 'POST',
          body: JSON.stringify({
            message,
            branch: branch || targetBranch || 'main',
          }),
        }
      );

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
    // Check if turn_hash is available for source tracing
    if (!sentence.source.turn_hash) {
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

      const contextData = await fetchApi<TurnContextData>(
        `/turns/${turnHash}/context?${params}`
      );

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
    const { prepared } = get();
    if (!prepared) return 0;
    return prepared.similarPairs.filter((p) => !p.resolution).length;
  },

  canCommit: () => {
    const { prepared, message, status } = get();
    if (!prepared || status !== 'pending') return false;
    if (!message.trim()) return false;

    const unresolvedCount = prepared.similarPairs.filter((p) => !p.resolution).length;
    return unresolvedCount === 0;
  },

  getPreviewSentences: () => {
    const { prepared } = get();
    if (!prepared) return [];

    const sentences: Sentence[] = [];

    // Add identical sentences
    sentences.push(...prepared.identical);

    // Add resolved similar pairs
    for (const pair of prepared.similarPairs) {
      if (pair.resolution === 'source') {
        sentences.push(pair.source);
      } else if (pair.resolution === 'target') {
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
}));
