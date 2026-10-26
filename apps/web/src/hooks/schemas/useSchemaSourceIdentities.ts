'use client';

import { useEffect, useState } from 'react';
import { type SchemaSourcePin, schemaSourceKey } from '@/domain/schemas/schemaProvenance';
import { fetchExploreRelease } from '@/infrastructure/explore';
import { fetchSchemaIntroduction } from '@/infrastructure/schemaCatalog';

export type SchemaSourceIdentity = {
  name: string;
  projectId: string | null;
  logo?: string;
  unavailable?: boolean;
};

/** Resolve each exact release once for all node badges; ignore responses from older selections. */
export function useSchemaSourceIdentities(sources: SchemaSourcePin[]) {
  const key = JSON.stringify(sources);
  const [result, setResult] = useState<{
    key: string;
    identities: Record<string, SchemaSourceIdentity>;
  }>();
  useEffect(() => {
    let cancelled = false;
    const pins = JSON.parse(key) as SchemaSourcePin[];
    const unique = new Map(pins.map((pin) => [schemaSourceKey(pin), pin]));
    setResult({ key, identities: {} });
    void Promise.all(
      [...unique].map(async ([id, source]) => {
        let identity: SchemaSourceIdentity = {
          name: source.canonicalName,
          projectId: source.projectId,
        };
        try {
          const query = new URLSearchParams({
            canonicalName: source.canonicalName,
            version: source.version,
            expectedHash: source.hash,
          });
          if (source.projectId) query.set('sourceProjectId', source.projectId);
          const release = await fetchExploreRelease(query.toString());
          if (release.item.release.artifactVersionId !== source.artifactVersionId)
            throw new Error('Source release identity changed.');
          identity = {
            name: release.item.identity.displayName || source.canonicalName,
            projectId: release.item.identity.ownerProjectId,
          };
          const reference = release.item.presentationRef;
          // A pinned introduction can provide the project's image, never its node provenance.
          if (reference) {
            try {
              const presentation = await fetchSchemaIntroduction(reference);
              const resource = presentation?.document.resources.find(
                (item) => item.path === presentation.document.avatarPath
              );
              if (resource) identity.logo = `data:${resource.mediaType};base64,${resource.base64}`;
            } catch {
              // The exact release remains usable when its optional image is inaccessible.
            }
          }
        } catch {
          identity.unavailable = true;
        }
        if (!cancelled)
          setResult((previous) => ({
            key,
            identities: { ...(previous?.key === key ? previous.identities : {}), [id]: identity },
          }));
      })
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return result?.key === key ? result.identities : {};
}
