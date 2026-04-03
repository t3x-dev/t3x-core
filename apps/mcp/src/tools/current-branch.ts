import { getClient } from '../client.js';

export const currentBranchTool = {
  name: 't3x_current_branch',
  description: 'Get the current active branch for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
    },
    required: ['project_id'],
  },
};

export async function handleCurrentBranch(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getCurrentBranch(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
