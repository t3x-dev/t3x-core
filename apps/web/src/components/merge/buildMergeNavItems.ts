/**
 * buildMergeNavItems — Pure function that builds navigation items
 * for the merge sidebar from merge result + resolution state.
 */

import type { MergeResult } from '@t3x-dev/core';
import { truncate } from '@/domain/format/truncate';
import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';
import { isConflictResolved } from '@/store/mergeWorkspaceStore';

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

export function buildMergeNavItems(
  prepared: MergeResult,
  conflictResolutions: Record<string, 'source' | 'target'>,
  extendedResolutions: Record<string, ExtendedResolutionData>,
  keepSourcePaths?: Set<string>,
  keepTargetPaths?: Set<string>
): MergeNavItem[] {
  const items: MergeNavItem[] = [];

  // Auto-kept nodes — single group entry
  if (prepared.autoKept.length > 0) {
    items.push({
      id: 'identical',
      type: 'identical',
      label: `${prepared.autoKept.length} identical`,
      status: 'auto-kept',
    });
  }

  // Conflicts — one entry per conflict path
  for (let i = 0; i < prepared.conflicts.length; i++) {
    const conflict = prepared.conflicts[i];
    const extRes = extendedResolutions[String(i)];
    const resolution = conflictResolutions[conflict.path];
    const resolved = isConflictResolved(resolution, extRes);

    items.push({
      id: `conflict-${i}`,
      type: 'conflict',
      label: truncate(conflict.path, MAX_LABEL_LENGTH),
      status: resolved ? 'resolved' : 'unresolved',
      conflictIndex: i,
    });
  }

  // Source-only — one entry per path
  for (let i = 0; i < prepared.onlyInSource.length; i++) {
    const path = prepared.onlyInSource[i];
    const kept = keepSourcePaths ? keepSourcePaths.has(path) : true;
    items.push({
      id: `source-${i}`,
      type: 'source-only',
      label: truncate(path, MAX_LABEL_LENGTH),
      status: kept ? 'kept' : 'discarded',
    });
  }

  // Target-only — one entry per path
  for (let i = 0; i < prepared.onlyInTarget.length; i++) {
    const path = prepared.onlyInTarget[i];
    const kept = keepTargetPaths ? keepTargetPaths.has(path) : true;
    items.push({
      id: `target-${i}`,
      type: 'target-only',
      label: truncate(path, MAX_LABEL_LENGTH),
      status: kept ? 'kept' : 'discarded',
    });
  }

  return items;
}
