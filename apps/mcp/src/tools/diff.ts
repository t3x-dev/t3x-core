import { getClient } from '../client.js';

export const diffTool = {
  name: 't3x_diff',
  description:
    'Compare two commits and show semantic differences. Returns added, removed, and modified sentences with word-level diffs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_hash: { type: 'string', description: 'Source commit hash (older)' },
      target_hash: { type: 'string', description: 'Target commit hash (newer)' },
    },
    required: ['source_hash', 'target_hash'],
  },
};

export async function handleDiff(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.twoWayDiff({
    base_commit_hash: args.source_hash as string,
    target_commit_hash: args.target_hash as string,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
