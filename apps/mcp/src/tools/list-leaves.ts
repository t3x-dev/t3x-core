import { getClient } from '../client.js';

export const listLeavesTool = {
  name: 't3x_list_leaves',
  description: 'List leaves (output templates) for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
    },
    required: ['project_id'],
  },
};

export async function handleListLeaves(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listLeaves(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
