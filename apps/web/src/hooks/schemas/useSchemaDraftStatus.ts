'use client';

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

interface SchemaDraftStatusResult {
  key: string;
  view?: WorkspaceAuthoringView;
  loading: boolean;
  error?: string;
}

/** A binding proves Draft usage. Only the authoring projection can prove it matches history. */
export function useSchemaDraftStatus(
  projectId: string,
  workspaceId: string,
  revision?: number,
  enabled = true
) {
  const key = JSON.stringify([projectId, workspaceId, revision, enabled]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const mounted = useRef(false);
  const request = useRef(0);
  const [result, setResult] = useState<SchemaDraftStatusResult>();
  const available = Boolean(enabled && projectId && workspaceId);

  const refresh = useCallback(async () => {
    if (!mounted.current || activeKey.current !== key || !available) return;
    const token = ++request.current;
    const isCurrent = () =>
      mounted.current && activeKey.current === key && token === request.current;
    setResult({ key, loading: true });
    try {
      const view = await getSharedApiClient().workspaces.authoring.read(projectId, workspaceId);
      if (!isCurrent()) return;
      if (view.workspaceRevision !== revision) {
        setResult({
          key,
          loading: false,
          error:
            'The Workspace revision changed. Refresh the Workspace before reviewing its changes.',
        });
        return;
      }
      setResult({ key, view, loading: false });
    } catch (cause) {
      if (isCurrent())
        setResult({
          key,
          loading: false,
          error:
            cause instanceof Error ? cause.message : 'Could not read the Workspace Draft status.',
        });
    }
  }, [available, key, projectId, revision, workspaceId]);

  useEffect(() => {
    mounted.current = true;
    ++request.current;
    void refresh();
    const focus = () => {
      void refresh();
    };
    if (available) window.addEventListener('focus', focus);
    return () => {
      mounted.current = false;
      ++request.current;
      window.removeEventListener('focus', focus);
    };
  }, [available, refresh]);

  const current = available && result?.key === key ? result : undefined;
  return {
    view: current?.view,
    loading: available && (current?.loading ?? true),
    error: current?.error,
    refresh,
  };
}
