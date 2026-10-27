'use client';

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

/** A binding proves Draft usage. Only the authoring projection can prove it matches history. */
export function useSchemaDraftStatus(projectId: string, workspaceId: string, revision?: number) {
  const key = `${projectId}:${workspaceId}:${revision}`;
  const [result, setResult] = useState<{ key: string; view: WorkspaceAuthoringView }>();
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    let request = 0;
    const read = () => {
      const token = ++request;
      void getSharedApiClient()
        .workspaces.authoring.read(projectId, workspaceId)
        .then(
          (view) => {
            if (active && token === request)
              setResult(view.workspaceRevision === revision ? { key, view } : undefined);
          },
          () => {
            if (active && token === request) setResult(undefined);
          }
        );
    };
    read();
    window.addEventListener('focus', read);
    return () => {
      active = false;
      window.removeEventListener('focus', read);
    };
  }, [projectId, workspaceId, revision, key]);
  return result?.key === key ? result.view : undefined;
}
