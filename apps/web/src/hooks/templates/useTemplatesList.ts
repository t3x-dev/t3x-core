/**
 * useTemplatesList — async loader for the raw Template[] list.
 *
 * Thin component-facing wrapper over `fetchTemplates()`. Separate from
 * `useTemplates()` which backs the templateStore with its filter /
 * debounce / mutation surface — consumers that only need "load the
 * list once for display" reach through here instead of dragging the
 * full mutation surface.
 */

import { useEffect, useState } from 'react';
import { fetchTemplates } from '@/queries/templates';
import type { Template } from '@/types/api';

export interface UseTemplatesListResult {
  templates: Template[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** True once the fetch has settled (success or error). */
  settled: boolean;
  /** Non-null if the fetch rejected. Components typically ignore and
   * fall back to their own defaults — matching the prior inline behaviour. */
  error: Error | null;
}

export function useTemplatesList(options?: { enabled?: boolean }): UseTemplatesListResult {
  const enabled = options?.enabled ?? true;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [settled, setSettled] = useState(!enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setSettled(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSettled(false);
    fetchTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSettled(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { templates, loading, settled, error };
}
