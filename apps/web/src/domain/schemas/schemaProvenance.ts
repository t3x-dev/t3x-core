import type { SchemaSourceCommit, StudioPreview } from '@t3x-dev/api-client';
import { type SchemaFieldRow, schemaRecord } from './schemaFieldEditing';

export type SchemaSourcePin = StudioPreview['sources'][number];
export type SchemaNodeSource = {
  key: string;
  name: string;
  version: string;
  pin?: SchemaSourcePin;
  commitRef?: SchemaSourceCommit;
};
export type SchemaNodeProvenance = {
  sources: SchemaNodeSource[];
  local: boolean;
  unknown: boolean;
  pending: boolean;
};

export function schemaSourceKey(source: SchemaSourcePin): string {
  return JSON.stringify([
    source.projectId,
    source.canonicalName,
    source.version,
    source.artifactVersionId,
    source.hash,
  ]);
}

export function schemaSourceReleaseHref(source: SchemaSourcePin): string {
  const params = new URLSearchParams({
    view: 'browse',
    type: 'schemas',
    schemaView: 'release',
    catalogName: source.canonicalName,
    catalogVersion: source.version,
    catalogHash: source.hash,
  });
  if (source.projectId) params.set('sourceProjectId', source.projectId);
  return `/explore?${params}`;
}

/** Never infer a node's origin from its name, parent, current branch or presentation Commit. */
export function schemaNodeProvenance(
  row: SchemaFieldRow,
  snapshotRow: SchemaFieldRow | undefined,
  origins: Record<string, unknown> | undefined,
  sources: SchemaSourcePin[],
  wholeSchemaSource?: SchemaSourcePin,
  nodeProvenance?: StudioPreview['nodeProvenance']
): SchemaNodeProvenance {
  const result: SchemaNodeProvenance = {
    sources: [],
    local: false,
    unknown: false,
    pending: origins === undefined,
  };
  if (!origins) return result;
  if (!snapshotRow) return { ...result, local: true };
  const found = new Map<string, SchemaNodeSource>();
  function visit(value: unknown, depth = 0) {
    if (depth > 8) {
      result.unknown = true;
      return;
    }
    const origin = schemaRecord(value);
    if (origin.kind === 'local') result.local = true;
    else if (origin.kind === 'derived' && Array.isArray(origin.sources) && origin.sources.length) {
      for (const source of origin.sources) visit(source, depth + 1);
    } else if (
      origin.kind === 'module' &&
      typeof origin.artifact === 'string' &&
      typeof origin.version === 'string'
    ) {
      const matches = sources.filter(
        (source) => source.canonicalName === origin.artifact && source.version === origin.version
      );
      const pins = new Map(matches.map((source) => [schemaSourceKey(source), source]));
      const pin = pins.size === 1 ? [...pins.values()][0] : undefined;
      const key = pin ? schemaSourceKey(pin) : JSON.stringify([origin.artifact, origin.version]);
      found.set(key, { key, name: origin.artifact, version: origin.version, pin });
      if (!pin) result.unknown = true;
    } else result.unknown = true;
  }
  const origin = origins[row.semanticPath];
  if (origin !== undefined) visit(origin);
  else if (wholeSchemaSource && Object.keys(origins).length === 0) {
    const key = schemaSourceKey(wholeSchemaSource);
    found.set(key, {
      key,
      name: wholeSchemaSource.canonicalName,
      version: wholeSchemaSource.version,
      pin: wholeSchemaSource,
    });
  } else result.unknown = true;
  if (JSON.stringify(row.definition) !== JSON.stringify(snapshotRow.definition))
    result.local = true;
  const committed = nodeProvenance?.byPath[row.semanticPath] ?? [];
  // Whole-Schema manifests may retain old compiler labels without their transitive pins.
  if (wholeSchemaSource && committed.length) found.clear();
  for (const entry of committed) {
    const source = entry.source;
    const key = JSON.stringify([source ? schemaSourceKey(source) : null, entry.commitRef]);
    // A verified per-node reference is more precise than the enclosing Release label.
    if (source)
      for (const [id, existing] of found)
        if (
          existing.name === source.canonicalName &&
          existing.version === source.version &&
          !existing.commitRef
        )
          found.delete(id);
    found.set(key, {
      key: source ? schemaSourceKey(source) + ':' + JSON.stringify(entry.commitRef) : key,
      name: source?.canonicalName ?? 'Source Commit',
      version: source?.version ?? entry.commitRef.commitDigest.slice(7, 14),
      pin: source ?? undefined,
      commitRef: entry.commitRef,
    });
  }
  if (committed.length) {
    // Avoid an enclosing whole-Schema fallback obscuring its original node references.
    if (wholeSchemaSource) found.delete(schemaSourceKey(wholeSchemaSource));
    result.unknown = false;
  }
  result.sources = [...found.values()];
  return result;
}
