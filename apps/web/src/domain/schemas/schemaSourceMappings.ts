import type { StudioPreviewInput } from '@t3x-dev/api-client';
import { type SchemaDefinition, type SchemaFieldRow, schemaFieldRows } from './schemaFieldEditing';

export type SchemaSourceMappings = NonNullable<StudioPreviewInput['sourceMappings']>;
export type SchemaImportSource = NonNullable<SchemaSourceMappings[number]['source']>;
export const withinSchemaPath = (path: string[], prefix: string[]) =>
  prefix.every((key, i) => path[i] === key);

/** Remap every descendant, including object slots, without changing its original source path. */
export function transferSchemaMappings(
  mappings: SchemaSourceMappings,
  before: SchemaDefinition,
  row: SchemaFieldRow,
  location: string[],
  source?: SchemaImportSource,
  original?: SchemaDefinition
): SchemaSourceMappings {
  const affected = schemaFieldRows(before).filter((item) =>
    withinSchemaPath(item.location, row.location)
  );
  const existing = new Map(mappings.map((entry) => [JSON.stringify(entry.path), entry]));
  const basePaths = new Set(schemaFieldRows(original ?? before).map((item) => item.path));
  const remaining = source
    ? mappings
    : mappings.filter((entry) => !withinSchemaPath(entry.path, row.location));
  return [
    ...remaining,
    ...affected.flatMap((item) => {
      const prior = source
        ? { from: item.location, source }
        : (existing.get(item.path) ??
          (basePaths.has(item.path) ? { from: item.location } : undefined));
      return prior
        ? [{ ...prior, path: [...location, ...item.location.slice(row.location.length)] }]
        : [];
    }),
  ];
}
export function pruneSchemaMappings(mappings: SchemaSourceMappings, definition: SchemaDefinition) {
  const paths = new Set(schemaFieldRows(definition).map((row) => row.path));
  return mappings.filter((entry) => paths.has(JSON.stringify(entry.path)));
}
