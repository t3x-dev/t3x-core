// apps/web/src/store/commitDetailStore.ts

import type { Commit, Frame } from '@t3x-dev/core';
import { create } from 'zustand';

export type FrameDiffStatus = 'identical' | 'added' | 'modified' | 'removed';

export interface EnrichedFrame {
  frame: Frame;
  diffStatus: FrameDiffStatus;
  /** For modified frames: the previous version from parent commit */
  previousFrame?: Frame;
}

interface SourceViewerState {
  isOpen: boolean;
  /** The slot key being inspected */
  activeSlotKey: string | null;
  /** Tab: 'previous' | 'current' for changed slots */
  activeTab: 'previous' | 'current';
}

interface CommitDetailState {
  // Data
  commit: Commit | null;
  parentCommit: Commit | null;
  enrichedFrames: EnrichedFrame[];
  removedFrames: EnrichedFrame[];

  // UI
  activeFrameId: string | null;
  sourceViewer: SourceViewerState;
  hoveredSlotKey: string | null;

  // Actions
  setCommit: (commit: Commit, parent: Commit | null) => void;
  setActiveFrame: (id: string | null) => void;
  openSourceViewer: (slotKey: string) => void;
  closeSourceViewer: () => void;
  setSourceTab: (tab: 'previous' | 'current') => void;
  setHoveredSlot: (key: string | null) => void;
}

function enrichFrames(
  commit: Commit,
  parent: Commit | null
): { enriched: EnrichedFrame[]; removed: EnrichedFrame[] } {
  const parentFrameMap = new Map((parent?.content.frames ?? []).map((f) => [f.id, f]));
  const currentIds = new Set(commit.content.frames.map((f) => f.id));

  const enriched: EnrichedFrame[] = commit.content.frames.map((frame) => {
    const prev = parentFrameMap.get(frame.id);
    if (!parent) return { frame, diffStatus: 'added' as const };
    if (!prev) return { frame, diffStatus: 'added' as const };
    const slotsChanged =
      JSON.stringify(frame.slots) !== JSON.stringify(prev.slots) || frame.type !== prev.type;
    return {
      frame,
      diffStatus: slotsChanged ? ('modified' as const) : ('identical' as const),
      previousFrame: slotsChanged ? prev : undefined,
    };
  });

  const removed: EnrichedFrame[] = (parent?.content.frames ?? [])
    .filter((f) => !currentIds.has(f.id))
    .map((frame) => ({ frame, diffStatus: 'removed' as const }));

  return { enriched, removed };
}

export const useCommitDetailStore = create<CommitDetailState>((set) => ({
  commit: null,
  parentCommit: null,
  enrichedFrames: [],
  removedFrames: [],
  activeFrameId: null,
  sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
  hoveredSlotKey: null,

  setCommit: (commit, parent) => {
    const { enriched, removed } = enrichFrames(commit, parent);
    set({
      commit,
      parentCommit: parent,
      enrichedFrames: enriched,
      removedFrames: removed,
      activeFrameId: null,
      sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
    });
  },

  setActiveFrame: (id) => set({ activeFrameId: id }),

  openSourceViewer: (slotKey) =>
    set(() => ({
      sourceViewer: { isOpen: true, activeSlotKey: slotKey, activeTab: 'current' },
    })),

  closeSourceViewer: () =>
    set((s) => ({
      sourceViewer: { ...s.sourceViewer, isOpen: false, activeSlotKey: null },
    })),

  setSourceTab: (tab) =>
    set((s) => ({
      sourceViewer: { ...s.sourceViewer, activeTab: tab },
    })),

  setHoveredSlot: (key) => set({ hoveredSlotKey: key }),
}));
