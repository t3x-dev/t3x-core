import type { AnyDB, YSchemaArtifactVersionView } from '@t3x-dev/storage';
import { listYSchemaArtifactVersions, upsertYSchemaArtifactVersion } from '@t3x-dev/storage';
import {
  builtInPrdCoreArtifact,
  builtInPrdModules,
  type NodeSchema,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
  type YSchemaCoreArtifact,
  type YSchemaModuleManifest,
} from '@t3x-dev/yschema';

export async function ensureBuiltInYSchemaArtifacts(db: AnyDB): Promise<void> {
  const artifacts: Array<YSchemaCoreArtifact | YSchemaModuleManifest> = [
    builtInPrdCoreArtifact,
    ...builtInPrdModules,
  ];
  for (const artifact of artifacts) {
    const artifactHash = await sha256CompositionValue(artifact);
    const nodes =
      artifact.apiVersion === 't3x.dev/yschema-core/v1'
        ? artifact.schema.nodes
        : (artifact.contribution.nodes ?? {});
    await upsertYSchemaArtifactVersion(db, {
      artifact_id: artifactId(artifact.canonicalName),
      artifact_version_id: artifactVersionId(artifact.canonicalName, artifact.version),
      canonical_name: artifact.canonicalName,
      family: artifact.family,
      kind: artifact.apiVersion === 't3x.dev/yschema-core/v1' ? 'core' : 'module',
      visibility: artifact.source === 'official' ? 'official' : 'community',
      version: artifact.version,
      status: artifact.status,
      manifest_json: artifact as unknown as Record<string, unknown>,
      artifact_hash: artifactHash,
      path_count: countNodePaths(nodes),
      created_by: 't3x:built-in-seed',
      provides: artifact.provides,
      requires: artifact.apiVersion === 't3x.dev/yschema-module/v1' ? artifact.requires : [],
    });
  }
}

export async function resolveCompositionArtifacts(
  db: AnyDB,
  composition: YSchemaCompositionDraft,
  projectId?: string
): Promise<{ core: YSchemaCoreArtifact; modules: YSchemaModuleManifest[] }> {
  await ensureBuiltInYSchemaArtifacts(db);
  const page = await listYSchemaArtifactVersions(db, {
    project_id: projectId,
    family: composition.family,
    limit: 100,
  });
  const coreView = page.items.find(
    (item) =>
      item.kind === 'core' &&
      item.canonicalName === composition.core.canonicalName &&
      item.version === composition.core.version
  );
  const requestedModules = new Set(
    composition.modules.map((module) => `${module.canonicalName}@${module.version}`)
  );
  return {
    core: (coreView?.manifest ?? builtInPrdCoreArtifact) as unknown as YSchemaCoreArtifact,
    modules: page.items
      .filter(
        (item) =>
          item.kind === 'module' && requestedModules.has(`${item.canonicalName}@${item.version}`)
      )
      .map((item) => item.manifest as unknown as YSchemaModuleManifest),
  };
}

export function artifactViewToManifest(view: YSchemaArtifactVersionView): Record<string, unknown> {
  return {
    ...view.manifest,
    artifactHash: view.artifactHash,
    visibility: view.visibility,
    ownerProjectId: view.ownerProjectId,
    versions: view.versions.map((version) => ({
      version: version.version,
      status: version.status,
      updatedAt: version.createdAt.toISOString(),
    })),
  };
}

function artifactId(canonicalName: string): string {
  return `ysa_${canonicalName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function artifactVersionId(canonicalName: string, version: string): string {
  return `${artifactId(canonicalName)}_${version.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function countNodePaths(nodes: Record<string, NodeSchema>): number {
  let count = 0;
  for (const node of Object.values(nodes)) {
    count += 1 + Object.keys(node.slots ?? {}).length;
    if (node.children && node.children !== 'any') count += countNodePaths(node.children);
  }
  return count;
}
