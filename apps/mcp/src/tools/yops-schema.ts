import { getYOpsJsonSchema } from '@t3x-dev/core';

export const yopsSchemaTool = {
  name: 't3x_yops_schema',
  description:
    'Get the JSON Schema for YOps (YAML Operations). ' +
    'Use this to understand the format before calling t3x_edit_draft. ' +
    'Local only, no API call needed.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleYopsSchema(_args: Record<string, unknown>) {
  const schema = getYOpsJsonSchema();
  return { content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }] };
}
