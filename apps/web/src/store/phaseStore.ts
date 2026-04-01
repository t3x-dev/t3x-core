/**
 * phaseStore — Phase state machine for the Gold Step extraction panel.
 *
 * Manages: phase lifecycle, viewTab, panel mode, entry path,
 *          gate issues, drift detection, advisory questions.
 *
 * Contract: PhaseStoreState & PhaseStoreActions (goldStepContracts.ts)
 */

import { create } from 'zustand';
import type { EntryPath, PanelMode, Phase, PhaseStore, ViewTab } from '@/types/goldStepContracts';

/** Map phase → default viewTab (auto-sync on setPhase) */
const PHASE_TO_TAB: Record<Phase, ViewTab> = {
  idle: 'yops',
  yops: 'yops',
  triage: 'triage',
  review: 'review',
};

export const usePhaseStore = create<PhaseStore>((set, get) => ({
  // ── State ──
  phase: 'idle' as Phase,
  viewTab: 'yops' as ViewTab,
  panelMode: 'default' as PanelMode,
  entryPath: 'extract' as EntryPath,
  gateIssues: {},
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  advisoryQuestions: [],

  // ── Actions ──

  setPhase(phase) {
    set({ phase, viewTab: PHASE_TO_TAB[phase] });
  },

  setViewTab(tab) {
    set({ viewTab: tab });
  },

  setPanelMode(mode) {
    set({ panelMode: mode });
  },

  setEntryPath(path) {
    set({ entryPath: path });
  },

  togglePanel() {
    set({ panelMode: get().panelMode === 'collapsed' ? 'default' : 'collapsed' });
  },

  setGateIssues(issues) {
    set({ gateIssues: issues });
  },

  setDriftDetected(info, choices) {
    set({ driftDetected: true, driftInfo: info, driftChoices: choices });
  },

  clearDrift() {
    set({ driftDetected: false, driftInfo: null, driftChoices: [] });
  },

  setAdvisoryQuestions(questions) {
    set({ advisoryQuestions: questions });
  },
}));
