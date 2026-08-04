import { and, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  yschemaArtifactCapabilities,
  yschemaArtifacts,
  yschemaArtifactVersions,
  yschemaCompositionSnapshots,
} from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export type YSchemaArtifactVisibility = 'community' | 'official' | 'private' | 'team';

export interface UpsertYSchemaArtifactVersionInput {
  artifact_id: string;
  artifact_version_id: string;
  canonical_name: string;
  family: string;
  kind: 'core' | 'module';
  owner_project_id?: string;
  visibility: YSchemaArtifactVisibility;
  version: string;
  status: 'active' | 'deprecated' | 'draft';
  manifest_json: Record<string, unknown>;
  artifact_hash: string;
  path_count: number;
  created_by?: string;
  provides: string[];
  requires: string[];
}

export interface YSchemaArtifactVersionView {
  artifactId: string;
  artifactVersionId: string;
  canonicalName: string;
  family: string;
  kind: string;
  ownerProjectId: string | null;
  visibility: string;
  version: string;
  status: string;
  manifest: Record<string, unknown>;
  artifactHash: string;
  pathCount: number;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{ version: string; status: string; createdAt: Date }>;
}

export interface ListYSchemaArtifactsOptions {
  project_id?: string;
  family?: string;
  kind?: 'core' | 'module';
  visibility?: YSchemaArtifactVisibility;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface FindYSchemaArtifactVersionInput {
  canonical_name: string;
  version: string;
  project_id?: string;
}

export interface ListProjectYSchemaVersionHistoryOptions {
  project_id: string;
  family?: string;
  kind?: 'core' | 'module';
}

export interface PublishYSchemaArtifactVersionInput extends UpsertYSchemaArtifactVersionInput {
  owner_project_id: string;
  visibility: 'private' | 'team';
  status: 'active';
}

export async function upsertYSchemaArtifactVersion(
  db: AnyDB,
  input: UpsertYSchemaArtifactVersionInput
): Promise<YSchemaArtifactVersionView> {
  const now = new Date();
  await db
    .insert(yschemaArtifacts)
    .values({
      artifactId: input.artifact_id,
      canonicalName: input.canonical_name,
      family: input.family,
      kind: input.kind,
      ownerProjectId: input.owner_project_id ?? null,
      visibility: input.visibility,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const [artifact] = await db
    .select()
    .from(yschemaArtifacts)
    .where(eq(yschemaArtifacts.canonicalName, input.canonical_name))
    .limit(1);
  if (!artifact || artifact.artifactId !== input.artifact_id) {
    throw new Error(`YSchema Artifact identity conflict for ${input.canonical_name}`);
  }

  await db
    .insert(yschemaArtifactVersions)
    .values({
      artifactVersionId: input.artifact_version_id,
      artifactId: artifact.artifactId,
      version: input.version,
      status: input.status,
      manifestJson: input.manifest_json,
      artifactHash: input.artifact_hash,
      pathCount: input.path_count,
      createdBy: input.created_by ?? null,
      createdAt: now,
    })
    .onConflictDoNothing();

  const [version] = await db
    .select()
    .from(yschemaArtifactVersions)
    .where(
      and(
        eq(yschemaArtifactVersions.artifactId, artifact.artifactId),
        eq(yschemaArtifactVersions.version, input.version)
      )
    )
    .limit(1);
  if (!version || version.artifactHash !== input.artifact_hash) {
    throw new Error(
      `Published YSchema Artifact ${input.canonical_name}@${input.version} is immutable`
    );
  }

  const capabilities = [
    ...input.provides.map((capability) => ({ direction: 'provides', capability })),
    ...input.requires.map((capability) => ({ direction: 'requires', capability })),
  ];
  if (capabilities.length > 0) {
    await db
      .insert(yschemaArtifactCapabilities)
      .values(
        capabilities.map((capability) => ({
          artifactVersionId: version.artifactVersionId,
          ...capability,
        }))
      )
      .onConflictDoNothing();
  }

  return joinedArtifactView(artifact, version);
}

export async function listYSchemaArtifactVersions(
  db: AnyDB,
  options: ListYSchemaArtifactsOptions = {}
): Promise<CursorPage<YSchemaArtifactVersionView>> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const conditions = [];
  if (options.family) conditions.push(eq(yschemaArtifacts.family, options.family));
  if (options.kind) conditions.push(eq(yschemaArtifacts.kind, options.kind));
  if (options.visibility) conditions.push(eq(yschemaArtifacts.visibility, options.visibility));
  if (options.search) {
    const escaped = options.search.replace(/[%_\\]/g, '\\$&');
    conditions.push(ilike(yschemaArtifacts.canonicalName, `%${escaped}%`));
  }

  const visible = options.project_id
    ? or(
        eq(yschemaArtifacts.visibility, 'official'),
        eq(yschemaArtifacts.visibility, 'community'),
        eq(yschemaArtifacts.ownerProjectId, options.project_id)
      )
    : or(eq(yschemaArtifacts.visibility, 'official'), eq(yschemaArtifacts.visibility, 'community'));
  conditions.push(visible!);

  if (options.cursor) {
    const { t, k } = decodeCursor(options.cursor);
    const cursorDate = new Date(t);
    conditions.push(
      or(
        lt(yschemaArtifacts.updatedAt, cursorDate),
        and(eq(yschemaArtifacts.updatedAt, cursorDate), lt(yschemaArtifacts.canonicalName, k))
      )!
    );
  }

  const rows = await db
    .select({ artifact: yschemaArtifacts, version: yschemaArtifactVersions })
    .from(yschemaArtifacts)
    .innerJoin(
      yschemaArtifactVersions,
      eq(yschemaArtifactVersions.artifactId, yschemaArtifacts.artifactId)
    )
    .where(and(eq(yschemaArtifactVersions.status, 'active'), ...conditions))
    .orderBy(desc(yschemaArtifacts.updatedAt), desc(yschemaArtifacts.canonicalName))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const artifactIds = pageRows.map(({ artifact }) => artifact.artifactId);
  const versionRows =
    artifactIds.length > 0
      ? await db
          .select()
          .from(yschemaArtifactVersions)
          .where(inArray(yschemaArtifactVersions.artifactId, artifactIds))
          .orderBy(desc(yschemaArtifactVersions.createdAt))
      : [];
  const versionsByArtifact = new Map<
    string,
    Array<{ version: string; status: string; createdAt: Date }>
  >();
  for (const version of versionRows) {
    const versions = versionsByArtifact.get(version.artifactId) ?? [];
    versions.push({
      version: version.version,
      status: version.status,
      createdAt: version.createdAt,
    });
    versionsByArtifact.set(version.artifactId, versions);
  }

  return toCursorPage(
    rows.map(({ artifact, version }) =>
      joinedArtifactView(artifact, version, versionsByArtifact.get(artifact.artifactId))
    ),
    limit,
    (item) => ({ t: item.updatedAt.toISOString(), k: item.canonicalName })
  );
}

/**
 * Publish one immutable project Artifact version and make it the active version
 * for that Artifact. Older versions remain addressable and are only deprecated.
 */
export async function publishYSchemaArtifactVersion(
  db: AnyDB,
  input: PublishYSchemaArtifactVersionInput
): Promise<YSchemaArtifactVersionView> {
  // biome-ignore lint/suspicious/noExplicitAny: AnyDB intentionally abstracts the supported drivers.
  return (db as any).transaction(async (tx: AnyDB) => {
    const [existingArtifact] = await tx
      .select()
      .from(yschemaArtifacts)
      .where(eq(yschemaArtifacts.canonicalName, input.canonical_name))
      .limit(1);
    if (
      existingArtifact &&
      (existingArtifact.artifactId !== input.artifact_id ||
        existingArtifact.ownerProjectId !== input.owner_project_id ||
        existingArtifact.kind !== input.kind ||
        existingArtifact.family !== input.family)
    ) {
      throw new Error(`YSchema Artifact identity conflict for ${input.canonical_name}`);
    }

    if (existingArtifact) {
      const [existingVersion] = await tx
        .select()
        .from(yschemaArtifactVersions)
        .where(
          and(
            eq(yschemaArtifactVersions.artifactId, input.artifact_id),
            eq(yschemaArtifactVersions.version, input.version)
          )
        )
        .limit(1);
      if (existingVersion) {
        if (
          existingVersion.artifactHash === input.artifact_hash &&
          existingVersion.status === 'active'
        ) {
          return joinedArtifactView(existingArtifact, existingVersion);
        }
        throw new Error(
          `Published YSchema Artifact ${input.canonical_name}@${input.version} is immutable`
        );
      }
    }

    await tx
      .update(yschemaArtifactVersions)
      .set({ status: 'deprecated' })
      .where(
        and(
          eq(yschemaArtifactVersions.artifactId, input.artifact_id),
          eq(yschemaArtifactVersions.status, 'active')
        )
      );

    const published = await upsertYSchemaArtifactVersion(tx, input);
    await tx
      .update(yschemaArtifacts)
      .set({ updatedAt: new Date() })
      .where(eq(yschemaArtifacts.artifactId, input.artifact_id));
    return published;
  });
}

/** Return every immutable project-owned version with its full manifest. */
export async function listProjectYSchemaVersionHistory(
  db: AnyDB,
  options: ListProjectYSchemaVersionHistoryOptions
): Promise<YSchemaArtifactVersionView[]> {
  const conditions = [eq(yschemaArtifacts.ownerProjectId, options.project_id)];
  if (options.family) conditions.push(eq(yschemaArtifacts.family, options.family));
  if (options.kind) conditions.push(eq(yschemaArtifacts.kind, options.kind));
  const rows = await db
    .select({ artifact: yschemaArtifacts, version: yschemaArtifactVersions })
    .from(yschemaArtifacts)
    .innerJoin(
      yschemaArtifactVersions,
      eq(yschemaArtifactVersions.artifactId, yschemaArtifacts.artifactId)
    )
    .where(and(...conditions))
    .orderBy(desc(yschemaArtifactVersions.createdAt), desc(yschemaArtifactVersions.version));

  const versionsByArtifact = new Map<
    string,
    Array<{ version: string; status: string; createdAt: Date }>
  >();
  for (const { artifact, version } of rows) {
    const versions = versionsByArtifact.get(artifact.artifactId) ?? [];
    versions.push({
      version: version.version,
      status: version.status,
      createdAt: version.createdAt,
    });
    versionsByArtifact.set(artifact.artifactId, versions);
  }
  return rows.map(({ artifact, version }) =>
    joinedArtifactView(artifact, version, versionsByArtifact.get(artifact.artifactId))
  );
}

/** Resolve one exact immutable version visible to the requesting project. */
export async function findYSchemaArtifactVersion(
  db: AnyDB,
  input: FindYSchemaArtifactVersionInput
): Promise<YSchemaArtifactVersionView | null> {
  const visible = input.project_id
    ? or(
        eq(yschemaArtifacts.visibility, 'official'),
        eq(yschemaArtifacts.visibility, 'community'),
        eq(yschemaArtifacts.ownerProjectId, input.project_id)
      )
    : or(eq(yschemaArtifacts.visibility, 'official'), eq(yschemaArtifacts.visibility, 'community'));
  const [row] = await db
    .select({ artifact: yschemaArtifacts, version: yschemaArtifactVersions })
    .from(yschemaArtifacts)
    .innerJoin(
      yschemaArtifactVersions,
      eq(yschemaArtifactVersions.artifactId, yschemaArtifacts.artifactId)
    )
    .where(
      and(
        eq(yschemaArtifacts.canonicalName, input.canonical_name),
        eq(yschemaArtifactVersions.version, input.version),
        visible!
      )
    )
    .limit(1);
  return row ? joinedArtifactView(row.artifact, row.version) : null;
}

export interface SaveYSchemaCompositionSnapshotInput {
  snapshot_id: string;
  project_id: string;
  composition_id: string;
  composition_revision: number;
  composition_hash: string;
  compiled_schema_hash: string;
  compiler_version: string;
  manifest_json: Record<string, unknown>;
  schema_json: Record<string, unknown>;
  render_plan_json: unknown[];
  origins_json: Record<string, unknown>;
}

export async function saveYSchemaCompositionSnapshot(
  db: AnyDB,
  input: SaveYSchemaCompositionSnapshotInput
) {
  await db
    .insert(yschemaCompositionSnapshots)
    .values({
      snapshotId: input.snapshot_id,
      projectId: input.project_id,
      compositionId: input.composition_id,
      compositionRevision: input.composition_revision,
      compositionHash: input.composition_hash,
      compiledSchemaHash: input.compiled_schema_hash,
      compilerVersion: input.compiler_version,
      manifestJson: input.manifest_json,
      schemaJson: input.schema_json,
      renderPlanJson: input.render_plan_json,
      originsJson: input.origins_json,
    })
    .onConflictDoNothing();

  const snapshot = await findYSchemaCompositionSnapshot(db, {
    project_id: input.project_id,
    composition_id: input.composition_id,
    composition_revision: input.composition_revision,
    compiled_schema_hash: input.compiled_schema_hash,
  });
  if (!snapshot || snapshot.compositionHash !== input.composition_hash) {
    throw new Error(
      `YSchema Composition ${input.composition_id}@r${input.composition_revision} is immutable`
    );
  }
  return snapshot;
}

export async function findYSchemaCompositionSnapshot(
  db: AnyDB,
  input: {
    project_id: string;
    composition_id: string;
    composition_revision: number;
    compiled_schema_hash?: string;
  }
) {
  const conditions = [
    eq(yschemaCompositionSnapshots.projectId, input.project_id),
    eq(yschemaCompositionSnapshots.compositionId, input.composition_id),
    eq(yschemaCompositionSnapshots.compositionRevision, input.composition_revision),
  ];
  if (input.compiled_schema_hash) {
    conditions.push(eq(yschemaCompositionSnapshots.compiledSchemaHash, input.compiled_schema_hash));
  }
  const [row] = await db
    .select()
    .from(yschemaCompositionSnapshots)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

function joinedArtifactView(
  artifact: typeof yschemaArtifacts.$inferSelect,
  version: typeof yschemaArtifactVersions.$inferSelect,
  versions = [{ version: version.version, status: version.status, createdAt: version.createdAt }]
): YSchemaArtifactVersionView {
  return {
    artifactId: artifact.artifactId,
    artifactVersionId: version.artifactVersionId,
    canonicalName: artifact.canonicalName,
    family: artifact.family,
    kind: artifact.kind,
    ownerProjectId: artifact.ownerProjectId,
    visibility: artifact.visibility,
    version: version.version,
    status: version.status,
    manifest: version.manifestJson,
    artifactHash: version.artifactHash,
    pathCount: version.pathCount,
    createdAt: version.createdAt,
    updatedAt: artifact.updatedAt,
    versions,
  };
}
