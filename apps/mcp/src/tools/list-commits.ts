import { getClient } from '../client.js';

export const listCommitsTool = {
  name: 't3x_list_commits',
  description:
    'List commits for a project. Returns commit hash, message, author, date, and tree count.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
      limit: { type: 'number', description: 'Max results (default 20)' },
    },
    required: ['project_id'],
  },
};

export async function handleListCommits(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listCommits(args.project_id as string, {
    branch: args.branch as string | undefined,
    limit: args.limit as number | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
