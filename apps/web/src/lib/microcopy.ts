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

import type { CopyMode } from '@/store/modeStore';
import { useModeStore } from '@/store/modeStore';

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
    default: (p) => `Versions merged — ${p.n} sentences unified`,
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
};

export type MicrocopyScenario =
  | 'commitSuccess'
  | 'mergeSuccess'
  | 'generateComplete'
  | 'emptyProject'
  | 'loading'
  | 'constraintsAllPass'
  | 'constraintsFail';

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
  const mode = useModeStore((s) => s.copyMode);
  return (scenario: MicrocopyScenario, params?: Record<string, string | number>) =>
    getMicrocopy(scenario, mode, params);
}
