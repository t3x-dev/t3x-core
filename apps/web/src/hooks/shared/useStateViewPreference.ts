'use client';
import { useCallback, useEffect, useState } from 'react';

type View = 'overview' | 'structure' | 'code';
const valid = (value: unknown): value is View =>
  value === 'overview' || value === 'structure' || value === 'code';
/** A local reading preference, never a source of project/ref/commit identity. */
export function useStateViewPreference(projectId: string) {
  const [saved, setSaved] = useState<{ projectId: string; view: View } | null>(null);
  useEffect(() => {
    let view: View = 'overview';
    try {
      const stored = window.localStorage.getItem(`t3x.state-view:${projectId}`);
      if (valid(stored)) view = stored;
    } catch {
      /* Reading preferences must not block State access. */
    }
    setSaved({ projectId, view });
  }, [projectId]);
  const remember = useCallback(
    (view: View) => {
      setSaved({ projectId, view });
      try {
        window.localStorage.setItem(`t3x.state-view:${projectId}`, view);
      } catch {
        /* Session choice still works. */
      }
    },
    [projectId]
  );
  return {
    preferredView: saved?.projectId === projectId ? saved.view : ('overview' as View),
    remember,
  };
}
