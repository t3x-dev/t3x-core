/**
 * Microcopy System (§8.4)
 *
 * Dual-mode user-facing text:
 * - default: friendly, governance-oriented
 * - developer: technical, Git-oriented
 *
 * Warm copy is ONLY for: Toast, empty states, milestone feedback.
 * Button text, headers, labels remain concise and direct regardless of mode.
 */

import { useSettingsStore } from '@/store/settingsStore';

export type CopyMode = 'default' | 'developer';

type CopyValue = string | ((params: Record<string, string | number>) => string);

interface MicrocopyEntry {
  default: CopyValue;
  developer: CopyValue;
}

const MICROCOPY: Record<string, MicrocopyEntry> = {
  commitSuccess: {
    default: 'Knowledge saved',
    developer: (p) => `Committed: ${p.hash_short}`,
  },
  mergeSuccess: {
    default: (p) => `Versions merged — ${p.n} nodes unified`,
    developer: (p) => `Merge complete: ${p.hash_short}`,
  },
  generateComplete: {
    default: (p) => `Output ready — ${p.wordCount} words`,
    developer: (p) => `Generated: ${p.wordCount} words, ${p.model}`,
  },
  emptyProject: {
    default: 'Start your first project',
    developer: 'No projects',
  },
  loading: {
    default: 'Preparing your workspace...',
    developer: 'Loading...',
  },
  constraintsAllPass: {
    default: 'All constraints satisfied',
    developer: 'All assertions passed',
  },
  constraintsFail: {
    default: (p) => `${p.n} constraints need attention`,
    developer: (p) => `${p.n} assertions failed`,
  },
  mergeReviewTitle: {
    default: 'Review Merge',
    developer: 'Merge Review',
  },
  mergeReviewConfirm: {
    default: 'Confirm Merge',
    developer: 'Execute Merge',
  },
  mergeReviewCancel: {
    default: 'Go Back',
    developer: 'Cancel',
  },
  reviewAndMerge: {
    default: '审查并合并',
    developer: 'Review & Merge',
  },
  backToCanvas: {
    default: '返回画布',
    developer: 'Back to Canvas',
  },
  stayHere: {
    default: '留在此页',
    developer: 'Stay Here',
  },
};

export type MicrocopyScenario =
  | 'commitSuccess'
  | 'mergeSuccess'
  | 'generateComplete'
  | 'emptyProject'
  | 'loading'
  | 'constraintsAllPass'
  | 'constraintsFail'
  | 'mergeReviewTitle'
  | 'mergeReviewConfirm'
  | 'mergeReviewCancel'
  | 'reviewAndMerge'
  | 'backToCanvas'
  | 'stayHere';

/**
 * Get microcopy string for a given scenario and mode.
 */
export function getMicrocopy(
  scenario: MicrocopyScenario,
  mode: CopyMode,
  params?: Record<string, string | number>
): string {
  const entry = MICROCOPY[scenario][mode];
  if (typeof entry === 'function') {
    return entry(params ?? {});
  }
  return entry;
}

/**
 * React hook that returns a getter bound to the current copy mode.
 *
 * @example
 * const mc = useMicrocopy();
 * mc('commitSuccess')              // "Knowledge saved"
 * mc('commitSuccess', { hash_short: 'abc123' }) // (ignored in default mode)
 */
export function useMicrocopy() {
  const mode: CopyMode = useSettingsStore((s) => (s.developerMode ? 'developer' : 'default'));
  return (scenario: MicrocopyScenario, params?: Record<string, string | number>) =>
    getMicrocopy(scenario, mode, params);
}
