import { getClient } from '../client.js';

export const createBranchTool = {
  name: 't3x_create_branch',
  description: 'Create a new branch from the current branch head.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'New branch name' },
      head_commit_hash: {
        type: 'string',
        description: 'Commit hash to set as branch head (optional, defaults to current HEAD)',
      },
    },
    required: ['project_id', 'name'],
  },
};

export async function handleCreateBranch(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createBranch({
    project_id: args.project_id as string,
    name: args.name as string,
    head_commit_hash: args.head_commit_hash as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
