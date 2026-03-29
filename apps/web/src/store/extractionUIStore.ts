/**
 * extractionUIStore — Panel display + hover tracing + quality annotations
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: panel mode, active view, hover state, gate issues, drift, advisory questions.
 */

import { create } from 'zustand';

// Debounce helper for hover interactions — prevents rapid-fire re-renders
// when mouse sweeps across YAML rows
let hoverNodeTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTurnTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DEBOUNCE_MS = 60;

type PanelMode = 'collapsed' | 'default';
type ActiveView = 'graph' | 'yaml';

export type ExtractionPhase = 'idle' | 'yops' | 'triage' | 'review';
export type ViewTab = 'yops' | 'triage' | 'review';

interface ExtractionUIState {
  /** Extraction lifecycle phase — set by the stream hook, drives auto-transitions */
  phase: ExtractionPhase;
  /** Which tab the user is viewing — can differ from phase (e.g. viewing YOps from triage) */
  viewTab: ViewTab;
  panelMode: PanelMode;
  activeView: ActiveView;

  // Hover linking between YAML <-> chat messages
  hoveredNodeId: string | null;
  hoveredSlotKey: string | null;
  hoveredTurnIndex: number | null;
  scrollToCenter: boolean;
  hoveredFromChat: boolean;

  // Focus intent (LLM-guided highlighting)
  focusIntentEnabled: boolean;
  llmHighlightedNodeIds: Record<string, boolean>;

  // Gate result (node quality annotation)
  gateIssues: Record<string, { severity: 'error' | 'warning' | 'info'; description: string }[]>;

  // Drift detection
  driftDetected: boolean;
  driftInfo: { relation?: string; new_topic?: string; old_topic?: string } | null;
  driftChoices: string[];

  // Advisory questions
  advisoryQuestions: Array<{
    id: string;
    type: string;
    treeId: string;
    slotKey?: string;
    question: string;
    currentValue?: unknown;
  }>;

  // Methods
  setPanelMode: (mode: PanelMode) => void;
  setActiveView: (view: ActiveView) => void;
  togglePanel: () => void;
  setHoveredNodeId: (id: string | null, slotKey?: string | null) => void;
  setHoveredTurnIndex: (index: number | null) => void;
  setGateIssues: (
    issues: Record<string, { severity: 'error' | 'warning' | 'info'; description: string }[]>
  ) => void;
  setDriftDetected: (
    info: { relation?: string; new_topic?: string; old_topic?: string },
    choices: string[]
  ) => void;
  clearDrift: () => void;
  setAdvisoryQuestions: (
    questions: Array<{
      id: string;
      type: string;
      treeId: string;
      slotKey?: string;
      question: string;
      currentValue?: unknown;
    }>
  ) => void;
  setPhase: (phase: ExtractionPhase) => void;
  setViewTab: (tab: ViewTab) => void;
  setFocusIntent: (enabled: boolean) => void;
  setLlmHighlightedNodeIds: (ids: string[]) => void;
}

export const useExtractionUIStore = create<ExtractionUIState>((set, get) => ({
  phase: 'idle',
  viewTab: 'yops',
  panelMode: 'collapsed',
  activeView: 'graph',
  hoveredNodeId: null,
  hoveredSlotKey: null,
  hoveredTurnIndex: null,
  scrollToCenter: false,
  hoveredFromChat: false,
  focusIntentEnabled: false,
  llmHighlightedNodeIds: {},
  gateIssues: {},
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  advisoryQuestions: [],

  setPhase: (phase) => set({ phase, viewTab: phase === 'idle' ? 'yops' : phase }),
  setViewTab: (tab) => set({ viewTab: tab }),
  setPanelMode: (mode) => set({ panelMode: mode }),
  setActiveView: (view) => set({ activeView: view }),

  togglePanel: () => {
    const current = get().panelMode;
    set({ panelMode: current === 'collapsed' ? 'default' : 'collapsed' });
  },

  setHoveredNodeId: (id, slotKey) => {
    if (hoverNodeTimer) clearTimeout(hoverNodeTimer);
    if (id === null) {
      // Clear immediately on mouse leave for snappy feel
      set({ hoveredNodeId: null, hoveredSlotKey: null, scrollToCenter: false, hoveredFromChat: false });
    } else {
      hoverNodeTimer = setTimeout(() => {
        set({ hoveredNodeId: id, hoveredSlotKey: slotKey ?? null });
      }, HOVER_DEBOUNCE_MS);
    }
  },

  setHoveredTurnIndex: (index) => {
    if (hoverTurnTimer) clearTimeout(hoverTurnTimer);
    if (index === null) {
      set({ hoveredTurnIndex: null });
    } else {
      hoverTurnTimer = setTimeout(() => {
        set({ hoveredTurnIndex: index });
      }, HOVER_DEBOUNCE_MS);
    }
  },

  setGateIssues: (issues) => set({ gateIssues: issues }),

  setDriftDetected: (info, choices) =>
    set({ driftDetected: true, driftInfo: info, driftChoices: choices }),

  clearDrift: () => set({ driftDetected: false, driftInfo: null, driftChoices: [] }),

  setAdvisoryQuestions: (questions) => set({ advisoryQuestions: questions }),

  setFocusIntent: (enabled) => set({ focusIntentEnabled: enabled }),

  setLlmHighlightedNodeIds: (ids) =>
    set({ llmHighlightedNodeIds: Object.fromEntries(ids.map((id) => [id, true])) }),
}));
