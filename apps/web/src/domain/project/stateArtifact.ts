import { JSON_SCHEMA, load } from 'js-yaml';

type SummaryRow = { name: string; type: string; preview: string };

function summarizeValue(name: string, value: unknown): SummaryRow {
  if (Array.isArray(value)) {
    return { name, type: 'List', preview: `${value.length} items` };
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const named = entries.find(
      ([key, field]) =>
        (key === 'title' || key === 'name') && typeof field === 'string' && field.trim()
    );
    return {
      name,
      type: 'Object',
      preview: named ? String(named[1]) : `${entries.length} fields`,
    };
  }
  if (value === null) return { name, type: 'Null', preview: 'null' };
  return {
    name,
    type: typeof value === 'string' ? 'Text' : typeof value === 'boolean' ? 'Boolean' : 'Number',
    preview: String(value) || 'Empty text',
  };
}

export function summarizeArtifactState(yaml: string) {
  const value: unknown = load(yaml, { schema: JSON_SCHEMA });
  const entries =
    value === undefined
      ? []
      : value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value)
        : [['Value', value] as const];
  const rows = entries.slice(0, 8).map(([name, field]) => summarizeValue(name, field));
  return { rows, remaining: entries.length - rows.length };
}
