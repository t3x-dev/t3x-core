import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Optimiser Store
 *
 * Manages state for the Agent Optimiser UI:
 * - Chart type preference (radar vs bar)
 * - Run comparison selection (V1/V2)
 * - Trace span expansion state
 * - Compare mode for RunsTable multi-selection
 */

export type ChartType = 'radar' | 'bar';

interface OptimiserState {
  // Chart preference (persisted)
  chartType: ChartType;

  // Comparison selection: [v1RunId, v2RunId]
  compareRunIds: [string | null, string | null];

  // Trace expansion: set of expanded span IDs
  expandedSpans: Set<string>;

  // Compare mode for RunsTable
  compareModeEnabled: boolean;
  selectedRunIds: Set<string>; // Max 2 runs for comparison

  // Actions
  setChartType: (type: ChartType) => void;
  selectForCompare: (slot: 0 | 1, runId: string | null) => void;
  clearCompare: () => void;
  toggleSpan: (spanId: string) => void;
  expandAllSpans: (spanIds: string[]) => void;
  collapseAllSpans: () => void;

  // Compare mode actions
  toggleCompareMode: () => void;
  toggleRunSelection: (runId: string) => void;
  clearSelectedRuns: () => void;
}

export const useOptimiserStore = create<OptimiserState>()(
  persist(
    (set) => ({
      // Initial state
      chartType: 'radar',
      compareRunIds: [null, null],
      expandedSpans: new Set<string>(),
      compareModeEnabled: false,
      selectedRunIds: new Set<string>(),

      // Actions
      setChartType: (type) => set({ chartType: type }),

      selectForCompare: (slot, runId) =>
        set((state) => {
          const newIds: [string | null, string | null] = [...state.compareRunIds];
          newIds[slot] = runId;
          return { compareRunIds: newIds };
        }),

      clearCompare: () => set({ compareRunIds: [null, null] }),

      toggleSpan: (spanId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedSpans);
          if (newExpanded.has(spanId)) {
            newExpanded.delete(spanId);
          } else {
            newExpanded.add(spanId);
          }
          return { expandedSpans: newExpanded };
        }),

      expandAllSpans: (spanIds) =>
        set(() => ({
          expandedSpans: new Set(spanIds),
        })),

      collapseAllSpans: () => set({ expandedSpans: new Set() }),

      // Compare mode actions
      toggleCompareMode: () =>
        set((state) => ({
          compareModeEnabled: !state.compareModeEnabled,
          // Clear selections when disabling compare mode
          selectedRunIds: state.compareModeEnabled ? new Set<string>() : state.selectedRunIds,
        })),

      toggleRunSelection: (runId) =>
        set((state) => {
          const newSelected = new Set(state.selectedRunIds);
          if (newSelected.has(runId)) {
            newSelected.delete(runId);
          } else {
            // Max 2 selections - if already 2, remove the oldest one
            if (newSelected.size >= 2) {
              const firstId = newSelected.values().next().value;
              if (firstId) newSelected.delete(firstId);
            }
            newSelected.add(runId);
          }
          return { selectedRunIds: newSelected };
        }),

      clearSelectedRuns: () => set({ selectedRunIds: new Set<string>() }),
    }),
    {
      name: 'optimiser-store',
      // Only persist chartType preference
      partialize: (state) => ({ chartType: state.chartType }),
      // Handle Set serialization for expandedSpans and selectedRunIds
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              // Restore defaults for non-persisted state
              compareRunIds: [null, null],
              expandedSpans: new Set(),
              compareModeEnabled: false,
              selectedRunIds: new Set(),
            },
          };
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
