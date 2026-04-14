/**
 * useDraftAutoPreview — fires `onFire` after a debounce when the
 * draft's previewStatus transitions to `'stale'` and auto-preview is
 * enabled. Replaces the module-level `autoPreviewTimer` +
 * `setAutoPreviewCallback` registry that used to live in
 * draftWorkspaceStore (v2 §2.5 — store is pure state).
 *
 * Design:
 *  - Effect re-subscribes on each status change; cleanup clears any
 *    pending timer, so rapid edits don't leak schedulers.
 *  - Hook has no internal state; the caller supplies `onFire` which
 *    typically wraps `useDraftWorkspaceActions.generatePreview`.
 */

import { useEffect } from 'react';

type PreviewStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

export function useDraftAutoPreview(
  autoPreview: boolean,
  previewStatus: PreviewStatus,
  onFire: () => void,
  debounceMs = 2000
): void {
  useEffect(() => {
    if (!autoPreview || previewStatus !== 'stale') return;
    const id = setTimeout(onFire, debounceMs);
    return () => {
      clearTimeout(id);
    };
  }, [autoPreview, previewStatus, onFire, debounceMs]);
}
