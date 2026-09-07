import { and, desc, eq, exists, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  projects,
  yschemaArtifactCapabilities,
  yschemaArtifacts,
  yschemaArtifactVersions,
} from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface ListYSchemaCatalogOptions {
  /** Must be authorized by the caller before including private/team releases. */
  project_id?: string;
  q?: string;
  canonical_name?: string;
  exact_version?: string;
  exact_hash?: string;
  tags?: string[];
  any_tags?: string[];
  ecosystem?: string;
  publisher?: string;
  family?: string;
  kind?: 'core' | 'module' | 'schema';
  /** Explicitly declared provides capability, not a runtime execution claim. */
  capability?: string;
  cursor?: string;
  limit?: number;
}

export interface YSchemaCatalogRelease {
  identity: {
    artifactId: string;
    canonicalName: string;
    displayName: string | null;
    description: string | null;
    tags: string[];
    family: string;
    publisher: string;
    ownerProjectId: string | null;
    visibility: string;
    metadataRevision: number;
  };
  release: {
    artifactVersionId: string;
    version: string;
    hash: string;
    kind: string;
    status: string;
    publishedAt: string;
  };
  presentationRef: {
    projectId: string;
    commitDigest: string;
    presentationDigest: string;
    coverPath?: string;
  } | null;
  contentKind: 'definition';
  definition: {
    pathCount: number;
    nodes: Array<{ path: string; slots: string[] }>;
    provides: string[];
    requires: string[];
  };
  formats: ['json', 'yaml'];
  validation: 'not-run';
  license: string | null;
}

/** Filter visibility, lifecycle and facets before pagination; never return raw manifests. */
export async function listYSchemaCatalogReleases(
  db: AnyDB,
  options: ListYSchemaCatalogOptions = {}
): Promise<CursorPage<YSchemaCatalogRelease>> {
  const a = yschemaArtifacts;
  const v = yschemaArtifactVersions;
  const cap = yschemaArtifactCapabilities;
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const publisher = sql<string>`split_part(${a.canonicalName}, '/', 1)`;
  const displayName = sql<string | null>`coalesce(${a.displayName}, case
    when jsonb_typeof(${v.manifestJson}->'title') = 'string'
    and length(${v.manifestJson}->>'title') <= 256 then ${v.manifestJson}->>'title' else null end)`;
  const description = sql<string | null>`coalesce(${a.description}, case
    when jsonb_typeof(${v.manifestJson}->'description') = 'string'
    and length(${v.manifestJson}->>'description') <= 4096 then ${v.manifestJson}->>'description' else null end)`;

  const conditions = [
    options.canonical_name ? eq(a.canonicalName, options.canonical_name) : undefined,
    options.exact_version ? eq(v.version, options.exact_version) : undefined,
    options.exact_hash ? eq(v.artifactHash, options.exact_hash) : undefined,
    eq(a.lifecycleStatus, 'active'),
    isNull(a.archivedAt),
    inArray(a.kind, ['core', 'module', 'schema']),
    inArray(v.status, ['active', 'published']),
    or(
      inArray(a.visibility, ['official', 'community']),
      options.project_id ? eq(a.ownerProjectId, options.project_id) : undefined
    ),
    or(
      isNull(a.ownerProjectId),
      exists(
        db
          .select({ id: projects.projectId })
          .from(projects)
          .where(and(eq(projects.projectId, a.ownerProjectId), isNull(projects.deletedAt)))
      )
    ),
  ];
  if (options.q) {
    const pattern = `%${options.q.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(
      or(ilike(a.canonicalName, pattern), ilike(displayName, pattern), ilike(description, pattern))
    );
  }
  if (options.family) conditions.push(eq(a.family, options.family));
  if (options.kind) conditions.push(eq(a.kind, options.kind));
  if (options.publisher) conditions.push(eq(publisher, options.publisher));
  for (const tag of [
    ...(options.tags ?? []),
    ...(options.ecosystem ? [`ecosystem:${options.ecosystem}`] : []),
  ]) {
    conditions.push(sql`${a.tags} @> ${JSON.stringify([tag])}::jsonb`);
  }
  if (options.any_tags?.length) {
    conditions.push(
      or(...options.any_tags.map((tag) => sql`${a.tags} @> ${JSON.stringify([tag])}::jsonb`))
    );
  }
  if (options.capability) {
    conditions.push(
      exists(
        db
          .select({ id: cap.artifactVersionId })
          .from(cap)
          .where(
            and(
              eq(cap.artifactVersionId, v.artifactVersionId),
              eq(cap.direction, 'provides'),
              eq(cap.capability, options.capability)
            )
          )
      )
    );
  }
  if (options.cursor) {
    const { t, k } = decodeCursor(options.cursor);
    const time = new Date(t);
    conditions.push(
      or(lt(v.createdAt, time), and(eq(v.createdAt, time), lt(v.artifactVersionId, k)))
    );
  }
  const rows = await db
    .select({
      artifactId: a.artifactId,
      canonicalName: a.canonicalName,
      displayName,
      description,
      tags: a.tags,
      family: a.family,
      publisher,
      ownerProjectId: a.ownerProjectId,
      visibility: a.visibility,
      metadataRevision: a.metadataRevision,
      artifactVersionId: v.artifactVersionId,
      version: v.version,
      hash: v.artifactHash,
      kind: a.kind,
      status: v.status,
      createdAt: v.createdAt,
      pathCount: v.pathCount,
      // Bounded names only, never slot values, README, samples or arbitrary manifest data.
      nodes: sql<Array<{ path: string; slots: string[] }>>`coalesce((
        select jsonb_agg(jsonb_build_object('path', section.key, 'slots', coalesce((
          select jsonb_agg(slot.key) from (
            select key from jsonb_object_keys(case when jsonb_typeof(section.value->'slots') = 'object'
              then section.value->'slots' else '{}'::jsonb end) as key order by key limit 3
          ) slot
        ), '[]'::jsonb))) from (
          select key, value from jsonb_each(case
            when jsonb_typeof(${v.manifestJson}#>'{contribution,nodes}') = 'object' then ${v.manifestJson}#>'{contribution,nodes}'
            when jsonb_typeof(${v.manifestJson}#>'{schema,nodes}') = 'object' then ${v.manifestJson}#>'{schema,nodes}'
            when jsonb_typeof(${v.manifestJson}->'nodes') = 'object' then ${v.manifestJson}->'nodes'
            else '{}'::jsonb end) order by key limit 3
        ) section
      ), '[]'::jsonb)`,
      // A catalog request never exposes another project's introduction reference.
      presentationRef: options.project_id
        ? sql<YSchemaCatalogRelease['presentationRef']>`case
        when ${a.ownerProjectId} = ${options.project_id}
        and ${v.manifestJson}#>>'{registry,presentationRef,projectId}' = ${options.project_id}
        and ${v.manifestJson}#>>'{registry,presentationRef,commitDigest}' ~ '^sha256:[0-9a-f]{64}$'
        and ${v.manifestJson}#>>'{registry,presentationRef,presentationDigest}' ~ '^sha256:[0-9a-f]{64}$'
        then jsonb_strip_nulls(jsonb_build_object(
          'projectId', ${a.ownerProjectId},
          'commitDigest', ${v.manifestJson}#>>'{registry,presentationRef,commitDigest}',
          'presentationDigest', ${v.manifestJson}#>>'{registry,presentationRef,presentationDigest}',
          'coverPath', case when jsonb_typeof(${v.manifestJson}#>'{registry,presentationRef,coverPath}') = 'string'
            and length(${v.manifestJson}#>>'{registry,presentationRef,coverPath}') between 1 and 200
            then ${v.manifestJson}#>>'{registry,presentationRef,coverPath}' else null end
        )) else null end`
        : sql<null>`null`,
      // Only a bounded declared license string is projected; no README/resource/starter data.
      license: sql<string | null>`case when jsonb_typeof(${v.manifestJson}->'license') = 'string'
      and length(${v.manifestJson}->>'license') <= 256 then ${v.manifestJson}->>'license' else null end`,
    })
    .from(a)
    .innerJoin(v, eq(v.artifactId, a.artifactId))
    .where(and(...conditions))
    .orderBy(desc(v.createdAt), desc(v.artifactVersionId))
    .limit(limit + 1);
  const ids = rows.slice(0, limit).map((row) => row.artifactVersionId);
  const capabilities = ids.length
    ? await db.select().from(cap).where(inArray(cap.artifactVersionId, ids))
    : [];
  return toCursorPage(
    rows.map((row) => ({
      identity: {
        artifactId: row.artifactId,
        canonicalName: row.canonicalName,
        displayName: row.displayName,
        description: row.description,
        tags: row.tags,
        family: row.family,
        publisher: row.publisher,
        ownerProjectId: row.ownerProjectId,
        visibility: row.visibility,
        metadataRevision: row.metadataRevision,
      },
      release: {
        artifactVersionId: row.artifactVersionId,
        version: row.version,
        hash: row.hash,
        kind: row.kind,
        status: row.status,
        publishedAt: row.createdAt.toISOString(),
      },
      presentationRef: row.presentationRef,
      contentKind: 'definition' as const,
      definition: {
        pathCount: row.pathCount,
        nodes: row.nodes,
        provides: capabilities
          .filter(
            (c) => c.artifactVersionId === row.artifactVersionId && c.direction === 'provides'
          )
          .map((c) => c.capability)
          .sort(),
        requires: capabilities
          .filter(
            (c) => c.artifactVersionId === row.artifactVersionId && c.direction === 'requires'
          )
          .map((c) => c.capability)
          .sort(),
      },
      formats: ['json', 'yaml'] as ['json', 'yaml'],
      validation: 'not-run' as const,
      license: row.license,
    })),
    limit,
    (item) => ({ t: item.release.publishedAt, k: item.release.artifactVersionId })
  );
}
