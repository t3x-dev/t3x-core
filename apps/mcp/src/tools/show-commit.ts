import { getClient } from '../client.js';

export const showCommitTool = {
  name: 't3x_show_commit',
  description:
    'Show the full content of a specific commit by hash. Unlike t3x_show (which returns the latest branch tip), this retrieves a particular historical commit. Returns sentences, author, message, parent hashes, and branch. Use hashes from t3x_list_commits.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      hash: { type: 'string', description: 'Commit hash (sha256:...)' },
    },
    required: ['hash'],
  },
};

export async function handleShowCommit(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getCommit(args.hash as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
