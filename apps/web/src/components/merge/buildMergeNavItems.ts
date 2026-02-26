/**
 * buildMergeNavItems — Pure function that builds navigation items
 * for the merge sidebar from merge result + resolution state.
 */

import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';
import { isConflictResolved } from '@/store/mergeWorkspaceStore';
import type { Merge2WayResult } from '@/types/merge';

export type NavItemStatus = 'auto-kept' | 'resolved' | 'unresolved' | 'kept' | 'discarded';

export interface MergeNavItem {
  /** Matches data-merge-nav value on the DOM element */
  id: string;
  type: 'identical' | 'conflict' | 'source-only' | 'target-only';
  label: string;
  status: NavItemStatus;
  conflictIndex?: number;
}

const MAX_LABEL_LENGTH = 50;

function truncate(text: string): string {
  if (text.length <= MAX_LABEL_LENGTH) return text;
  return `${text.slice(0, MAX_LABEL_LENGTH - 1)}…`;
}

export function buildMergeNavItems(
  prepared: Merge2WayResult,
  extendedResolutions: Record<string, ExtendedResolutionData>
): MergeNavItem[] {
  const items: MergeNavItem[] = [];

  // Identical sentences — single group entry
  if (prepared.identical.length > 0) {
    items.push({
      id: 'identical',
      type: 'identical',
      label: `${prepared.identical.length} identical`,
      status: 'auto-kept',
    });
  }

  // Conflicts — one entry per pair
  for (let i = 0; i < prepared.similarPairs.length; i++) {
    const pair = prepared.similarPairs[i];
    const extRes = extendedResolutions[String(i)];
    const resolved = isConflictResolved(pair, extRes);

    items.push({
      id: `conflict-${i}`,
      type: 'conflict',
      label: truncate(pair.source.text),
      status: resolved ? 'resolved' : 'unresolved',
      conflictIndex: i,
    });
  }

  // Source-only — one entry per sentence
  for (let i = 0; i < prepared.onlyInSource.length; i++) {
    const candidate = prepared.onlyInSource[i];
    items.push({
      id: `source-${i}`,
      type: 'source-only',
      label: truncate(candidate.sentence.text),
      status: candidate.keep ? 'kept' : 'discarded',
    });
  }

  // Target-only — one entry per sentence
  for (let i = 0; i < prepared.onlyInTarget.length; i++) {
    const candidate = prepared.onlyInTarget[i];
    items.push({
      id: `target-${i}`,
      type: 'target-only',
      label: truncate(candidate.sentence.text),
      status: candidate.keep ? 'kept' : 'discarded',
    });
  }

  return items;
}
