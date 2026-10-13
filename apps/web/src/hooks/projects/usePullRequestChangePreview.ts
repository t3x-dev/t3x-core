import { useEffect, useState } from 'react';
import {
  buildStructuredStateDiff,
  type StructuredDiffChange,
} from '@/domain/diff/structuredStateDiff';
import { getApiCommit } from '@/infrastructure/commits';

/** Compare the exact candidate revisions; never substitute a moving branch HEAD. */
export function usePullRequestChangePreview(
  projectId?: string,
  source?: string,
  base?: string | null
) {
  const key = projectId && source && base ? JSON.stringify([projectId, source, base]) : null;
  const [result, setResult] = useState<{
    key: string;
    changes: StructuredDiffChange[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!key || !projectId || !source || !base) return;
    let cancelled = false;
    Promise.all([getApiCommit(source, projectId), getApiCommit(base, projectId)])
      .then(([head, baseline]) => {
        if (!head.content?.trees || !baseline.content?.trees)
          throw new Error('Field preview is unavailable for these revisions.');
        if (
          head.hash !== source ||
          baseline.hash !== base ||
          head.project_id !== projectId ||
          baseline.project_id !== projectId
        )
          throw new Error('The comparison returned a different project or revision.');
        const changes = buildStructuredStateDiff({
          baseline: baseline.content,
          head: head.content,
        });
        if (!cancelled) setResult({ key, changes, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key,
            changes: [],
            error: 'Field preview unavailable. The comparison summary remains below.',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key, projectId, source, base]);
  return {
    changes: result?.key === key ? result?.changes : undefined,
    error: result?.key === key ? result?.error : null,
    loading: Boolean(key && result?.key !== key),
  };
}
