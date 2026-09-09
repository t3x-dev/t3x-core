'use client';
import { useSearchParams } from 'next/navigation';
import { useSchemaCatalog } from '@/hooks/schemas/useSchemaCatalog';
import { AddToStudio } from './AddToStudio';
/** Only a verified release-to-introduction link can attach adoption to generic State. */
export function StateSchemaAdoption({
  projectId,
  commitDigest,
}: {
  projectId: string;
  commitDigest: string;
}) {
  const params = useSearchParams();
  const name = params?.get('schemaRelease');
  const version = params?.get('schemaVersion');
  const hash = params?.get('schemaHash');
  const catalog = useSchemaCatalog(
    projectId,
    new URLSearchParams({ q: name ?? '', limit: '100' }).toString(),
    !!name && !!version && !!hash
  );
  const item = catalog.data?.items.find(
    (release) =>
      release.identity.canonicalName === name &&
      release.release.version === version &&
      release.release.hash === hash &&
      release.presentationRef?.commitDigest === commitDigest &&
      release.presentationRef.projectId === projectId
  );
  if (!item) return null;
  return (
    <div className="mb-4 flex justify-end">
      <AddToStudio
        title={item.identity.displayName ?? item.identity.canonicalName}
        defaultProjectId={params?.get('studioTarget') ?? projectId}
        source={{
          sourceProjectId: projectId,
          canonicalName: item.identity.canonicalName,
          version: item.release.version,
          expectedHash: item.release.hash,
        }}
      />
    </div>
  );
}
