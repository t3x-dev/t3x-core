import type { AnyDB, YSchemaArtifactVersionView } from '@t3x-dev/storage';
import { findYSchemaArtifactVersion, upsertYSchemaArtifactVersion } from '@t3x-dev/storage';
import {
  builtInYSchemaCores,
  builtInYSchemaModules,
  type NodeSchema,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
  type YSchemaCompositionDraftV2,
  type YSchemaCoreArtifact,
  type YSchemaModuleArtifactV2,
  type YSchemaModuleManifest,
} from '@t3x-dev/yschema';

export async function ensureBuiltInYSchemaArtifacts(db: AnyDB): Promise<void> {
  const artifacts: Array<YSchemaCoreArtifact | YSchemaModuleManifest> = [
    ...builtInYSchemaCores,
    ...builtInYSchemaModules,
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
  const [coreView, ...moduleViews] = await Promise.all([
    findYSchemaArtifactVersion(db, {
      canonical_name: composition.core.canonicalName,
      version: composition.core.version,
      project_id: projectId,
    }),
    ...composition.modules.map((module) =>
      findYSchemaArtifactVersion(db, {
        canonical_name: module.canonicalName,
        version: module.version,
        project_id: projectId,
      })
    ),
  ]);
  const fallbackCore =
    builtInYSchemaCores.find((artifact) => artifact.family === composition.family) ??
    builtInYSchemaCores[0];
  if (!fallbackCore) throw new Error('No built-in YSchema Core artifacts are registered.');
  return {
    core: (coreView?.manifest ?? fallbackCore) as unknown as YSchemaCoreArtifact,
    modules: moduleViews.flatMap((item) =>
      item?.kind === 'module' ? [item.manifest as unknown as YSchemaModuleManifest] : []
    ),
  };
}

export async function resolveCompositionArtifactsV2(
  db: AnyDB,
  composition: YSchemaCompositionDraftV2,
  projectId?: string
): Promise<YSchemaModuleArtifactV2[]> {
  await ensureBuiltInYSchemaArtifacts(db);
  const views = await Promise.all(
    composition.modules.map((module) =>
      findYSchemaArtifactVersion(db, {
        canonical_name: module.canonicalName,
        version: module.version,
        project_id: projectId,
      })
    )
  );
  return views.flatMap((view) =>
    view && view.kind !== 'schema' ? [artifactViewToOpenModule(view)] : []
  );
}

export function artifactViewToOpenModule(
  view: YSchemaArtifactVersionView
): YSchemaModuleArtifactV2 {
  const manifest = view.manifest as Record<string, unknown>;
  if (manifest.apiVersion === 't3x.dev/yschema-module/v2') {
    return manifest as unknown as YSchemaModuleArtifactV2;
  }
  const module = manifest.apiVersion === 't3x.dev/yschema-module/v1';
  const contribution = asRecord(manifest.contribution);
  const schema = asRecord(manifest.schema);
  const family = typeof manifest.family === 'string' ? manifest.family : 'general';
  const domain = typeof manifest.domain === 'string' ? manifest.domain.toLowerCase() : 'foundation';
  const provides = Array.isArray(manifest.provides)
    ? manifest.provides.flatMap((capability) =>
        typeof capability === 'string' ? [{ capability, version: 1 }] : []
      )
    : [];
  const requires =
    module && Array.isArray(manifest.requires)
      ? manifest.requires.filter((value): value is string => typeof value === 'string')
      : [];
  return {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: view.canonicalName,
    version: view.version,
    title: String(manifest.title ?? view.canonicalName),
    description: String(manifest.description ?? ''),
    status: view.status === 'draft' || view.status === 'deprecated' ? view.status : 'active',
    source:
      manifest.source === 'team' || manifest.source === 'community' ? manifest.source : 'official',
    tags: [
      ...(module ? [] : ['role:core']),
      `type:${family}`,
      `domain:${domain.replace(/\s+/g, '-')}`,
      `source:${manifest.source === 'team' || manifest.source === 'community' ? manifest.source : 'official'}`,
    ],
    compatibility: { yschema: ['0.1'] },
    provides,
    imports: [],
    suggests: requires.map((capability) => ({ capability, version: 1 })),
    contribution: {
      nodes: (module
        ? contribution.nodes
        : schema.nodes) as YSchemaModuleArtifactV2['contribution']['nodes'],
      relationTypes: (module
        ? contribution.relationTypes
        : schema.relationTypes) as YSchemaModuleArtifactV2['contribution']['relationTypes'],
      rules: (module
        ? contribution.rules
        : schema.rules) as YSchemaModuleArtifactV2['contribution']['rules'],
    },
    registry: {
      ...asRecord(manifest.registry),
      legacyApiVersion: manifest.apiVersion,
      artifactHash: view.artifactHash,
    },
  };
}

export function artifactViewToManifest(view: YSchemaArtifactVersionView): Record<string, unknown> {
  const manifest = view.manifest as Record<string, unknown>;
  const module =
    manifest.apiVersion === 't3x.dev/yschema-module/v1' ||
    manifest.apiVersion === 't3x.dev/yschema-module/v2';
  const schema = manifest.apiVersion === 't3x.dev/yschema-blueprint/v1' || view.kind === 'schema';
  const family = typeof manifest.family === 'string' ? manifest.family : 'general';
  const domain =
    typeof manifest.domain === 'string'
      ? manifest.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : 'foundation';
  const declaredTags = Array.isArray(manifest.tags)
    ? manifest.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const derivedTags = [
    ...(module || schema ? [] : ['role:core']),
    `type:${family}`,
    `domain:${domain}`,
    `version:${view.version}`,
    `source:${manifest.source === 'team' || manifest.source === 'community' ? manifest.source : 'official'}`,
    `status:${view.status}`,
    schema ? 'artifact:schema' : module ? 'contribution:structure' : 'contribution:foundation',
  ];
  return {
    ...manifest,
    canonicalName: view.canonicalName,
    version: view.version,
    status: view.status,
    artifactHash: view.artifactHash,
    updatedAt: view.createdAt.toISOString(),
    visibility: view.visibility,
    ownerProjectId: view.ownerProjectId,
    declaredTags,
    derivedTags,
    tags: Array.from(new Set([...declaredTags, ...derivedTags])).sort(),
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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
