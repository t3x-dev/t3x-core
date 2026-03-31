/**
 * t3x_schema MCP Tool
 *
 * Returns the T3X JSON Schema so agents can understand
 * the expected YAML/JSON format for semantic content.
 * Local only — no API call, no auth needed.
 */

import { getSemanticContentJsonSchema, getTreeNodeJsonSchema } from '@t3x-dev/core';

export const schemaTool = {
  name: 't3x_schema',
  description:
    'Get the T3X JSON Schema for semantic content. Use this to understand the expected YAML/JSON format before creating or committing knowledge.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['content', 'tree'],
        description: 'Schema type: content (default) or tree',
      },
    },
  },
};

export async function handleSchema(args: Record<string, unknown>) {
  const type = (args.type as string) || 'content';
  const schema = type === 'tree' ? getTreeNodeJsonSchema() : getSemanticContentJsonSchema();
  return { content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }] };
}
