'use client';

import { useCallback } from 'react';
import {
  setProjectYSchemaLifecycle,
  updateProjectYSchemaIdentity,
} from '@/infrastructure/schemaComposition';
import type { SchemaFamilyPreview } from '@/types/schemas';

export function useYSchemaIdentityManagement(projectId: string, refresh: () => Promise<unknown>) {
  const updateIdentity = useCallback(
    async (
      family: SchemaFamilyPreview,
      update: { displayName: string; description: string; tags: string[] }
    ) => {
      if (!family.artifactId || !family.metadataRevision) return;
      await updateProjectYSchemaIdentity(projectId, family.artifactId, {
        ifRevision: family.metadataRevision,
        ...update,
      });
      await refresh();
    },
    [projectId, refresh]
  );

  const setLifecycle = useCallback(
    async (family: SchemaFamilyPreview, action: 'archive' | 'restore') => {
      if (!family.artifactId || !family.metadataRevision) return;
      await setProjectYSchemaLifecycle(
        projectId,
        family.artifactId,
        action,
        family.metadataRevision
      );
      await refresh();
    },
    [projectId, refresh]
  );

  return { setLifecycle, updateIdentity };
}
