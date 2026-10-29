import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import { type SchemaDefinition, type SchemaFieldRow, schemaFieldRows } from './schemaFieldEditing';
import { type SchemaSourcePin, schemaNodeProvenance, schemaSourceKey } from './schemaProvenance';
import { type SchemaSourceMappings, withinSchemaPath } from './schemaSourceMappings';

/** UI-only associations. An exact path requires a mapping, a recorded reference or an exact Base. */
export type SchemaSourceRelation = {
  candidateId?: string;
  schemaHash?: string;
  sourceKey?: string;
  location?: string[];
  semanticPath?: string;
  baseLocation?: string[];
};

export function schemaSourceRelations(
  rows: SchemaFieldRow[],
  mappings: SchemaSourceMappings,
  provenance?: Pick<StudioPreview, 'schema' | 'origins' | 'sources' | 'nodeProvenance'>,
  base?: SchemaDefinition,
  wholeSchemaSource?: SchemaSourcePin
): Map<string, SchemaSourceRelation[]> {
  const snapshots = new Map(
    schemaFieldRows(provenance?.schema ?? {}).map((row) => [row.path, row])
  );
  const baseRows = new Map(schemaFieldRows(base ?? {}).map((row) => [row.path, row]));
  const mapped = new Map(mappings.map((entry) => [JSON.stringify(entry.path), entry]));
  return new Map<string, SchemaSourceRelation[]>(
    rows.map((row) => {
      const mapping = mapped.get(row.path);
      if (mapping?.source) return [row.path, [{ ...mapping.source, location: mapping.from }]];
      const originalPath = mapping ? JSON.stringify(mapping.from) : row.path;
      const original = snapshots.get(originalPath) ?? snapshots.get(row.path);
      const info = schemaNodeProvenance(
        original ? { ...row, semanticPath: original.semanticPath } : row,
        original,
        provenance?.origins,
        provenance?.sources ?? [],
        wholeSchemaSource,
        provenance?.nodeProvenance
      );
      const baseRow = baseRows.get(originalPath);
      return [
        row.path,
        info.sources.flatMap((source) =>
          source.pin
            ? [
                {
                  sourceKey: schemaSourceKey(source.pin),
                  semanticPath: source.commitRef?.sourcePath,
                  baseLocation: baseRow?.location,
                },
              ]
            : []
        ),
      ];
    })
  );
}

export function relatesToSource(relation: SchemaSourceRelation, candidate: StudioCandidate) {
  return relation.candidateId
    ? relation.candidateId === candidate.id
    : !!candidate.source && relation.sourceKey === schemaSourceKey(candidate.source);
}

export function sourceContainsRelation(
  relation: SchemaSourceRelation,
  candidate: StudioCandidate,
  item: SchemaFieldRow,
  preview: StudioPreview,
  baseMatchesSource: boolean
) {
  if (!relatesToSource(relation, candidate)) return false;
  if (relation.schemaHash && relation.schemaHash !== preview.schemaHash) return false;
  if (relation.location) return withinSchemaPath(relation.location, item.location);
  if (relation.semanticPath)
    return (
      relation.semanticPath === item.semanticPath ||
      relation.semanticPath.startsWith(`${item.semanticPath}/`)
    );
  return !!(
    baseMatchesSource &&
    relation.baseLocation &&
    withinSchemaPath(relation.baseLocation, item.location)
  );
}

export function isSourceBase(base: SchemaDefinition | undefined, preview: StudioPreview) {
  return !!base && canonicalJson(base as YValue) === canonicalJson(preview.schema as YValue);
}
