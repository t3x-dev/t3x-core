import { JSON_SCHEMA, load } from 'js-yaml';

const SUMMARY_LIMIT = 16;

type SummaryField = { name: string; value: string };
type SummaryRow = { path: string[]; fields: SummaryField[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSemanticState(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.domain === 't3x.dev/semantic-content' &&
    value.version === 1 &&
    isRecord(value.content) &&
    Array.isArray(value.content.trees) &&
    Array.isArray(value.content.relations)
  );
}

function* summarizeFields(
  value: unknown,
  path: string[] = []
): Generator<{ path: string[]; value: string }> {
  if (value === undefined) return;

  if (Array.isArray(value) || isRecord(value)) {
    const entries = Array.isArray(value)
      ? value.map((field, index) => [`[${index + 1}]`, field] as const)
      : Object.entries(value);
    if (entries.length) {
      for (const [name, field] of entries) {
        yield* summarizeFields(field, [...path, name]);
      }
      return;
    }
    if (path.length === 0) return;
    yield { path, value: Array.isArray(value) ? 'Empty list' : 'Empty object' };
    return;
  }

  yield { path: path.length ? path : ['Value'], value: String(value) || 'Empty text' };
}

export function summarizeArtifactState(yaml: string, structureYaml: string) {
  const value: unknown = load(yaml, { schema: JSON_SCHEMA });
  // Structure already projects the semantic tree of this same Commit into business fields.
  const semantic = isSemanticState(value);
  const content: unknown = semantic ? load(structureYaml, { schema: JSON_SCHEMA }) : value;
  const roots = semantic && isRecord(content) ? Object.values(content) : [];
  const document = roots.length === 1 && isRecord(roots[0]) ? roots[0] : content;
  const rows = new Map<string, SummaryRow>();
  let count = 0;
  for (const field of summarizeFields(document)) {
    if (count++ === SUMMARY_LIMIT) return { rows: [...rows.values()], hasMore: true };
    const path = field.path.slice(0, -1);
    const key = JSON.stringify(path.length ? path : field.path);
    const entry = { name: field.path[field.path.length - 1], value: field.value };
    const row = rows.get(key);
    if (row) row.fields.push(entry);
    else rows.set(key, { path, fields: [entry] });
  }
  return { rows: [...rows.values()], hasMore: false };
}
