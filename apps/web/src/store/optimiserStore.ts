import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Optimiser Store
 *
 * Manages state for the Agent Optimiser UI:
 * - Chart type preference (radar vs bar)
 * - Run comparison selection (V1/V2)
 * - Trace span expansion state
 */

export type ChartType = 'radar' | 'bar';

interface OptimiserState {
  // Chart preference (persisted)
  chartType: ChartType;

  // Comparison selection: [v1RunId, v2RunId]
  compareRunIds: [string | null, string | null];

  // Trace expansion: set of expanded span IDs
  expandedSpans: Set<string>;

  // Actions
  setChartType: (type: ChartType) => void;
  selectForCompare: (slot: 0 | 1, runId: string | null) => void;
  clearCompare: () => void;
  toggleSpan: (spanId: string) => void;
  expandAllSpans: (spanIds: string[]) => void;
  collapseAllSpans: () => void;
}

export const useOptimiserStore = create<OptimiserState>()(
  persist(
    (set) => ({
      // Initial state
      chartType: 'radar',
      compareRunIds: [null, null],
      expandedSpans: new Set<string>(),

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
    }),
    {
      name: 'optimiser-store',
      // Only persist chartType preference
      partialize: (state) => ({ chartType: state.chartType }),
      // Handle Set serialization for expandedSpans
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
