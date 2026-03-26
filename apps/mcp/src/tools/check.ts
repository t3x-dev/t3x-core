import { getClient } from '../client.js';

export const checkTool = {
  name: 't3x_check',
  description: 'Check if text complies with project leaf constraints (require/exclude rules).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      text: { type: 'string', description: 'Text to validate' },
      leaf_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: check specific leaves only',
      },
    },
    required: ['project_id', 'text'],
  },
};

export async function handleCheck(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.check({
    project_id: args.project_id as string,
    text: args.text as string,
    leaf_ids: args.leaf_ids as string[] | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
