import { getClient } from '../client.js';

export const createBranchTool = {
  name: 't3x_create_branch',
  description: 'Create a new branch from the current branch head.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'New branch name' },
      source_branch: { type: 'string', description: 'Branch to fork from (default: main)' },
    },
    required: ['project_id', 'name'],
  },
};

export async function handleCreateBranch(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createBranch({
    project_id: args.project_id as string,
    name: args.name as string,
    source_branch: args.source_branch as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
