import {
  type SchemaNodeProvenance,
  SchemaNodeProvenanceSchema,
  type StudioPreview,
  StudioSourceSchema,
} from '@t3x-dev/api-client';
import {
  type AnyDB,
  findProjectById,
  findYSchemaArtifactVersion,
  getRepositoryDecisionAuditByDigest,
  getVerifiedTransitionCommitGraph,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import {
  type NodeSchema,
  normalizeYSchemaObject,
  sha256CompositionValue,
  type YSchema,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assertProjectAccess } from './project-access';
import { workspaceAuthoringState } from './workspace-authoring';
import { recoverCommittedSchema, unboundWorkspaceSchema } from './workspace-schema-review';

type Source = StudioPreview['sources'][number];
type Entry = SchemaNodeProvenance['byPath'][string][number];
/** Pins embedded by the server in moved/imported origins, separate from the editing Base. */
export function schemaOriginSources(origins: Record<string, unknown>): Source[] {
  const sources = new Map<string, Source>();
  function visit(value: unknown, depth = 0) {
    if (depth > 8) return;
    const origin = record(value);
    const parsed = StudioSourceSchema.safeParse(origin.source);
    if (parsed.success) sources.set(canonicalizeProtocolValue(parsed.data), parsed.data);
    if (Array.isArray(origin.sources)) origin.sources.forEach((entry) => visit(entry, depth + 1));
  }
  Object.values(origins).forEach((origin) => visit(origin));
  return [...sources.values()];
}
export const emptyNodeProvenance = (): SchemaNodeProvenance => ({ version: 1, byPath: {} });
export function readNodeProvenance(value: unknown): SchemaNodeProvenance {
  const parsed = SchemaNodeProvenanceSchema.safeParse(value);
  return parsed.success && Object.keys(parsed.data.byPath).length <= 10000
    ? parsed.data
    : emptyNodeProvenance();
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function schemaNodes(schema: Pick<YSchema, 'nodes'>) {
  const nodes = new Map<string, NodeSchema>();
  function visit(children: YSchema['nodes'], prefix = '') {
    for (const [key, node] of Object.entries(children)) {
      const path = prefix ? `${prefix}/${key}` : key;
      nodes.set(path, node);
      if (node.children && node.children !== 'any') visit(node.children, path);
    }
  }
  visit(schema.nodes);
  return nodes;
}
/** Definitions at exact semantic paths, including nested object fields. */
export function schemaOriginDefinitions(schema: Pick<YSchema, 'nodes'>) {
  const definitions = new Map<string, Record<string, unknown>>();
  const field = (value: unknown, path: string) => {
    const definition = record(value);
    definitions.set(path, definition);
    for (const [name, child] of Object.entries(record(definition.properties)))
      field(child, `${path}/${name}`);
  };
  for (const [path, node] of schemaNodes(schema)) {
    definitions.set(path, node as Record<string, unknown>);
    for (const [name, value] of Object.entries(node.slots ?? {})) field(value, `${path}/${name}`);
  }
  return definitions;
}

/** Materialize the verified whole-Release fallback before an edit can replace it with local origin. */
export function publishedSchemaOrigins(
  schema: YSchema,
  source: Source,
  origins: Record<string, unknown> = {}
) {
  const result = { ...origins };
  const origin = {
    kind: 'module',
    artifact: source.canonicalName,
    version: source.version,
    source,
  };
  for (const path of schemaOriginDefinitions(schema).keys()) result[path] ??= origin;
  return result;
}
function unique(entries: Entry[]) {
  return [...new Map(entries.map((entry) => [canonicalizeProtocolValue(entry), entry])).values()];
}

/** Join compiler origins to exact, already verified Release pins outside the compiler. */
export function composeNodeProvenance(
  schema: YSchema,
  origins: Record<string, unknown>,
  entries: Array<{ source: Source; manifest: Record<string, unknown>; whole: boolean }>,
  wholeOnly = false
): SchemaNodeProvenance {
  const result = emptyNodeProvenance();
  const available = entries.map((entry) => ({
    ...entry,
    provenance: readNodeProvenance(record(entry.manifest.registry).nodeProvenance),
  }));
  const paths = [...schemaNodes(schema)].flatMap(([path, node]) => [
    path,
    ...Object.keys(node.slots ?? {}).map((slot) => `${path}/${slot}`),
  ]);
  for (const path of paths) {
    const refs: Entry[] = [];
    const add = (entry: (typeof available)[number]) => {
      for (const ref of entry.provenance.byPath[path] ?? [])
        refs.push({ ...ref, source: ref.source ?? entry.source });
    };
    const visit = (value: unknown, depth = 0) => {
      if (depth > 8) return;
      const origin = record(value);
      if (origin.kind === 'derived' && Array.isArray(origin.sources))
        origin.sources.forEach((source) => visit(source, depth + 1));
      else if (origin.kind === 'module' || origin.kind === 'core') {
        const matches = available.filter(
          (entry) =>
            entry.source.canonicalName === origin.artifact &&
            entry.source.version === origin.version
        );
        if (matches.length === 1) add(matches[0]!);
      }
    };
    if (wholeOnly && available.length === 1 && available[0]!.whole) add(available[0]!);
    else visit(origins[path]);
    if (refs.length) result.byPath[path] = unique(refs);
  }
  return result;
}

async function committedDefinition(db: AnyDB, projectId: string, digest: string) {
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, digest);
  if (!graph) return null;
  const audit = await getRepositoryDecisionAuditByDigest(
    db,
    projectId,
    graph.commit.decision.digest
  );
  return audit
    ? recoverCommittedSchema(db, projectId, audit.refName, digest, unboundWorkspaceSchema())
    : null;
}

/** Mint new references only from the Workspace's pinned, inherited Schema, never the live HEAD. */
export async function inheritWorkspaceCommitSources(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown> | undefined,
  schema: YSchema,
  sources: Source[],
  provenance: SchemaNodeProvenance
): Promise<SchemaNodeProvenance> {
  if (!workspace?.authoringLedger) return provenance;
  const { basis } = workspaceAuthoringState(workspace);
  if (!basis.refHead) return provenance;
  const base = await committedDefinition(db, projectId, basis.refHead);
  if (!base?.definition || !base.schemaHash) return provenance;
  const binding = record(base.bindings[0]);
  const pinned = Array.isArray(binding.studioSources) ? binding.studioSources : [];
  const sameSources = pinned.length
    ? canonicalizeProtocolValue(pinned) === canonicalizeProtocolValue(sources)
    : sources.length === 1 &&
      sources[0]!.canonicalName === binding.canonicalName &&
      sources[0]!.version === binding.version;
  if (!sameSources) return provenance;
  const before = schemaNodes(normalizeYSchemaObject(base.definition));
  const result = readNodeProvenance(provenance);
  for (const [path, node] of schemaNodes(schema)) {
    const previous = before.get(path);
    if (
      result.byPath[path]?.length ||
      !previous ||
      canonicalizeProtocolValue(previous as unknown as ProtocolValue) !==
        canonicalizeProtocolValue(node as unknown as ProtocolValue)
    )
      continue;
    result.byPath[path] = [
      {
        source: null,
        commitRef: {
          projectId,
          commitDigest: basis.refHead,
          schemaHash: base.schemaHash,
          sourcePath: path,
        },
      },
    ];
  }
  return result;
}

/** References are evidence, never authority. Access and frozen Schema evidence are rechecked. */
export async function accessibleNodeProvenance(
  c: Context,
  db: AnyDB,
  provenance: SchemaNodeProvenance,
  publicOnly = false
): Promise<SchemaNodeProvenance> {
  const result = emptyNodeProvenance();
  const resolveNodes = async (projectId: string, digest: string) => {
    const definition = await committedDefinition(db, projectId, digest);
    return definition?.definition
      ? {
          hash: definition.schemaHash,
          paths: schemaNodes(normalizeYSchemaObject(definition.definition)),
        }
      : null;
  };
  const definitions = new Map<string, ReturnType<typeof resolveNodes>>();
  const projects = new Map<string, Promise<boolean>>();
  const permitted = (id: string) => {
    if (!projects.has(id))
      projects.set(
        id,
        (async () => {
          const project = await findProjectById(db, id);
          return (
            !!project &&
            (!publicOnly || project.visibility === 'public') &&
            !((await assertProjectAccess(c, db, id, 'project:read')) instanceof Response)
          );
        })()
      );
    return projects.get(id)!;
  };
  for (const [path, refs] of Object.entries(provenance.byPath)) {
    for (const entry of refs) {
      const ref = entry.commitRef;
      if (
        !(await permitted(ref.projectId)) ||
        (entry.source?.projectId && !(await permitted(entry.source.projectId)))
      )
        continue;
      const key = JSON.stringify([ref.projectId, ref.commitDigest]);
      if (!definitions.has(key))
        definitions.set(key, resolveNodes(ref.projectId, ref.commitDigest));
      const definition = await definitions.get(key)!;
      if (
        !definition ||
        definition.hash !== ref.schemaHash ||
        !definition.paths.has(ref.sourcePath)
      )
        continue;
      (result.byPath[path] ??= []).push(entry);
    }
  }
  return result;
}

/** Public releases cannot publish private/unlisted project identity through provenance metadata. */
export async function publicSchemaSources(db: AnyDB, sources: Source[]) {
  const result: Source[] = [];
  const uniqueSources = new Map(
    sources.map((source) => [canonicalizeProtocolValue(source), source])
  );
  for (const source of uniqueSources.values()) {
    if (source.projectId && (await findProjectById(db, source.projectId))?.visibility !== 'public')
      continue;
    const view = await findYSchemaArtifactVersion(db, {
      canonical_name: source.canonicalName,
      version: source.version,
      ...(source.projectId ? { project_id: source.projectId } : {}),
    });
    if (
      view &&
      ['official', 'community'].includes(view.visibility) &&
      view.artifactHash === source.hash &&
      view.artifactVersionId === source.artifactVersionId
    )
      result.push(source);
  }
  return result;
}
export function publicSchemaOrigins(origins: Record<string, unknown>, sources: Source[]) {
  function clean(value: unknown): unknown {
    const origin = record(value);
    if (origin.kind === 'local') return { kind: 'local', contributionId: 'published', revision: 1 };
    if (origin.kind === 'derived' && Array.isArray(origin.sources)) {
      const remaining = origin.sources.map(clean).filter(Boolean);
      return remaining.length ? { kind: 'derived', sources: remaining } : undefined;
    }
    if (
      (origin.kind === 'module' || origin.kind === 'core') &&
      sources.some(
        (source) => source.canonicalName === origin.artifact && source.version === origin.version
      )
    )
      return {
        kind: origin.kind,
        artifact: origin.artifact,
        version: origin.version,
        ...(origin.source &&
        sources.some(
          (pin) =>
            canonicalizeProtocolValue(pin) ===
            canonicalizeProtocolValue(origin.source as ProtocolValue)
        )
          ? { source: origin.source }
          : {}),
      };
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(origins).map(([path, origin]) => [path, clean(origin) ?? { kind: 'unrecorded' }])
  );
}

export function publicSchemaRenderPlan<T extends object>(plan: T[], sources: Source[]): T[] {
  return plan.filter((entry) =>
    sources.some(
      (source) =>
        source.canonicalName === record(entry).artifact && source.version === record(entry).version
    )
  );
}

export async function readReleaseNodeProvenance(
  c: Context,
  db: AnyDB,
  manifest: Record<string, unknown>
) {
  return accessibleNodeProvenance(
    c,
    db,
    readNodeProvenance(record(manifest.registry).nodeProvenance)
  );
}

export async function publicNodeProvenance(
  c: Context,
  db: AnyDB,
  provenance: SchemaNodeProvenance
) {
  const result = await accessibleNodeProvenance(c, db, provenance, true);
  const pins = await publicSchemaSources(
    db,
    Object.values(result.byPath).flatMap((refs) =>
      refs.flatMap((ref) => (ref.source ? [ref.source] : []))
    )
  );
  for (const [path, refs] of Object.entries(result.byPath)) {
    result.byPath[path] = refs.filter(
      (ref) =>
        !ref.source ||
        pins.some((pin) => canonicalizeProtocolValue(pin) === canonicalizeProtocolValue(ref.source))
    );
    if (!result.byPath[path]!.length) delete result.byPath[path];
  }
  return result;
}

/** The compatibility publisher uses the same exact references and disclosure rules as Studio. */
export async function compositionPublicationSources(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  schema: YSchema,
  origins: Record<string, unknown>,
  references: Array<{ canonicalName: string; version: string }>
) {
  const entries = [];
  for (const ref of references) {
    const view = await findYSchemaArtifactVersion(db, {
      project_id: projectId,
      canonical_name: ref.canonicalName,
      version: ref.version,
    });
    if (!view || (await sha256CompositionValue(view.manifest)) !== view.artifactHash) continue;
    if (
      view.ownerProjectId &&
      (await assertProjectAccess(c, db, view.ownerProjectId, 'project:read')) instanceof Response
    )
      continue;
    entries.push({
      source: {
        projectId: view.ownerProjectId,
        canonicalName: view.canonicalName,
        version: view.version,
        artifactVersionId: view.artifactVersionId,
        hash: view.artifactHash,
      },
      manifest: view.manifest,
      whole: view.kind === 'schema',
    });
  }
  const sources = entries.map((entry) => entry.source);
  const provenance = await inheritWorkspaceCommitSources(
    db,
    projectId,
    workspace,
    schema,
    sources,
    composeNodeProvenance(schema, origins, entries)
  );
  return {
    sources: await publicSchemaSources(db, sources),
    nodeProvenance: await publicNodeProvenance(c, db, provenance),
  };
}
