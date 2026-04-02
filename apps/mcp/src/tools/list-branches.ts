import { getClient } from '../client.js';

export const listBranchesTool = {
  name: 't3x_list_branches',
  description: 'List all branches for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
    },
    required: ['project_id'],
  },
};

export async function handleListBranches(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listBranches(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
