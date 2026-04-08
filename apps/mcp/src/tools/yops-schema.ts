import { getYOpsJsonSchema } from '@t3x-dev/core';

export const yopsSchemaTool = {
  name: 't3x_yops_schema',
  description:
    'Get the JSON Schema for YOps (YAML Operations). ' +
    'Returns the Zod-derived JSON Schema for all 18 YOps operations. ' +
    'Use this to understand field names and types before calling t3x_edit_draft.\n\n' +
    '**Quick reference — most common ops:**\n' +
    '- `set: { path, value }` — update one slot (most common for incremental edits)\n' +
    '- `populate: { path, values }` — update multiple slots at once\n' +
    '- `define: { path }` — create new empty node\n' +
    '- `drop: { path }` — remove node and children\n' +
    '- `unset: { path }` — remove one slot\n\n' +
    'Paths use `/` separator (e.g., `trip/budget`). Keys are snake_case. Local only, no API call needed.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleYopsSchema(_args: Record<string, unknown>) {
  const schema = getYOpsJsonSchema();
  return { content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }] };
}
