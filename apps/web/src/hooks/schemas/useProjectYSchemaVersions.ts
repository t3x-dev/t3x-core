'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadProjectYSchemaVersions } from '@/infrastructure/schemaComposition';
import type { PublishedSchemaVersionManifest } from '@/types/schemaModules';

export function useProjectYSchemaVersions(projectId: string) {
  const [versions, setVersions] = useState<PublishedSchemaVersionManifest[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(true);

  const refresh = useCallback(async () => {
    setPending(true);
    setError(undefined);
    try {
      const history = await loadProjectYSchemaVersions(projectId);
      setVersions(history.items);
      return history.items;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Schema version history failed to load.');
      return [];
    } finally {
      setPending(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { error, pending, refresh, versions };
}
