import type { SchemaNodeProvenance, StudioPreview } from '@t3x-dev/api-client';
import { parseSchemaSourceMappings } from '@t3x-dev/application';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import { StudioError } from './schema-studio-preview';

type Source = Pick<
  StudioPreview,
  'schemaHash' | 'origins' | 'nodeProvenance' | 'sources' | 'adoption'
> & { schema: object };
export type ResolveSchemaMappingSource = (id: string) => Promise<Source>;
const semantic = (path: readonly string[]) => path.filter((_, i) => i % 2).join('/');
function at(value: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return;
    value = (value as Record<string, unknown>)[key];
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Resolve only authorized, exact source bytes. Client input never supplies Commit references. */
export async function applySchemaSourceMappings(
  base: Source,
  result: Record<string, unknown>,
  rawMappings: unknown,
  resolve?: ResolveSchemaMappingSource
) {
  let mappings: ReturnType<typeof parseSchemaSourceMappings>;
  try {
    mappings = parseSchemaSourceMappings(rawMappings ?? []);
  } catch (error) {
    throw new StudioError('INVALID_REQUEST', (error as Error).message);
  }
  const origins: Record<string, unknown> = {};
  const nodeProvenance: SchemaNodeProvenance = { version: 1, byPath: {} };
  const cache = new Map<string, Source>();
  for (const mapping of mappings) {
    let source = base;
    if (mapping.source) {
      if (!resolve)
        throw new StudioError(
          'INVALID_REQUEST',
          'Source imports require authorized source resolution.'
        );
      const id = mapping.source.candidateId;
      if (!cache.has(id)) cache.set(id, await resolve(id));
      source = cache.get(id)!;
      if (source.schemaHash !== mapping.source.schemaHash)
        throw new StudioError(
          'CONFLICT',
          'The imported source changed. Reload its exact definition.'
        );
      if (!source.adoption.allowed)
        throw new StudioError(
          'FORBIDDEN',
          source.adoption.reason ?? 'This source cannot be imported.'
        );
    }
    const before = at(source.schema, mapping.from),
      after = at(result, mapping.path);
    if (!before || !after)
      throw new StudioError('INVALID_REQUEST', 'A mapped source or destination no longer exists.');
    const path = semantic(mapping.path),
      from = semantic(mapping.from);
    let origin =
      source.origins[from] ??
      (mapping.from.at(-2) === 'slots'
        ? source.origins[semantic(mapping.from.slice(0, -2))]
        : undefined);
    // A source pin also preserves the Release fallback for old objects without Commit metadata.
    if ((mapping.source || !origin) && source.sources.length === 1) {
      const pin = source.sources[0]!;
      origin = { kind: 'module', artifact: pin.canonicalName, version: pin.version, source: pin };
    }
    if (origin) {
      const unchanged =
        canonicalizeProtocolValue(before as ProtocolValue) ===
        canonicalizeProtocolValue(after as ProtocolValue);
      origins[path] = unchanged
        ? origin
        : {
            kind: 'derived',
            sources: [origin, { kind: 'local', contributionId: 'studio-source-edit', revision: 1 }],
          };
    }
    const refs =
      source.nodeProvenance?.byPath[from] ??
      (mapping.from.at(-2) === 'slots'
        ? source.nodeProvenance?.byPath[semantic(mapping.from.slice(0, -2))]
        : undefined);
    nodeProvenance.byPath[path] = structuredClone(refs ?? []);
  }
  return { origins, nodeProvenance };
}
