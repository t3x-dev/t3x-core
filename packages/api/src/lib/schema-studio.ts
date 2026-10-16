import type { StudioCandidate } from '@t3x-dev/api-client';
import type {
  AnyDB,
  SchemaStudioCandidateRecord,
  YSchemaArtifactVersionView,
} from '@t3x-dev/storage';
import { findYSchemaArtifactVersion } from '@t3x-dev/storage';
import {
  builtInYSchemaCores,
  builtInYSchemaModules,
  sha256CompositionValue,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assertProjectAccess } from './project-access';

const licenses = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0']);
export class SchemaSourceUnavailableError extends Error {}

/** One redistribution policy for Studio and the compatibility Composition entry point. */
export async function schemaSourceAdoptionReason(
  c: Context | undefined,
  db: AnyDB,
  projectId: string,
  view: YSchemaArtifactVersionView
): Promise<string | null> {
  if (view.lifecycleStatus !== 'active' || !['active', 'published'].includes(view.status))
    return 'Source release is unavailable.';
  if ((await sha256CompositionValue(view.manifest)) !== view.artifactHash)
    return 'Source release failed integrity verification.';
  if (
    view.ownerProjectId &&
    view.ownerProjectId !== projectId &&
    (!c ||
      (await assertProjectAccess(c, db, view.ownerProjectId, 'project:read')) instanceof Response)
  )
    return 'Source release is unavailable or no longer authorized.';
  if (view.ownerProjectId === projectId) return null;
  if (view.visibility === 'private' || view.visibility === 'team') {
    if (
      !c ||
      !view.ownerProjectId ||
      (await assertProjectAccess(c, db, view.ownerProjectId, 'project:edit')) instanceof Response
    )
      return 'Importing private structure requires edit authority on its source project.';
    return null;
  }
  const builtIn = [...builtInYSchemaCores, ...builtInYSchemaModules].find(
    (item) => item.canonicalName === view.canonicalName && item.version === view.version
  );
  if (builtIn && (await sha256CompositionValue(builtIn)) === view.artifactHash) return null;
  return typeof view.manifest.license === 'string' && licenses.has(view.manifest.license)
    ? null
    : 'This release has no supported declared redistribution license. Ask its publisher before importing.';
}

/** References confer no authority. Every use rechecks source visibility and integrity. */
export async function resolveStudioSource(
  c: Context,
  db: AnyDB,
  source: {
    sourceProjectId: string | null;
    canonicalName: string;
    version: string;
    artifactHash?: string;
  }
) {
  if (source.sourceProjectId) {
    const access = await assertProjectAccess(c, db, source.sourceProjectId, 'project:read');
    if (access instanceof Response) return null;
  }
  const view = await findYSchemaArtifactVersion(db, {
    canonical_name: source.canonicalName,
    version: source.version,
    ...(source.sourceProjectId ? { project_id: source.sourceProjectId } : {}),
  });
  if (!view || view.lifecycleStatus !== 'active' || !['active', 'published'].includes(view.status))
    return null;
  // An owned release always stays tied to that source project's live authority.
  if (view.ownerProjectId && view.ownerProjectId !== source.sourceProjectId) return null;
  if (source.artifactHash && view.artifactHash !== source.artifactHash) return null;
  if ((await sha256CompositionValue(view.manifest)) !== view.artifactHash) return null;
  return view;
}
export async function projectStudioCandidate(
  c: Context,
  db: AnyDB,
  row: SchemaStudioCandidateRecord
): Promise<StudioCandidate> {
  const view = await resolveStudioSource(c, db, row);
  return {
    id: row.id,
    projectId: row.projectId,
    studioId: 'main',
    createdAt: row.createdAt.toISOString(),
    available: !!view,
    source: view
      ? {
          projectId: row.sourceProjectId,
          canonicalName: row.canonicalName,
          version: row.version,
          hash: row.artifactHash,
          artifactVersionId: row.artifactVersionId,
        }
      : null,
    title: view ? String(view.displayName ?? view.manifest.title ?? view.canonicalName) : null,
    description: view ? String(view.description ?? view.manifest.description ?? '') : null,
    kind: view ? (view.kind as 'core' | 'module' | 'schema') : null,
    license: view && typeof view.manifest.license === 'string' ? view.manifest.license : null,
    reason: view
      ? null
      : 'Source unavailable or no longer authorized. The pinned version was not replaced.',
  };
}
