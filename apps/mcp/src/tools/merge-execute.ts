import { getClient } from '../client.js';

export const mergeExecuteTool = {
  name: 't3x_merge_execute',
  description:
    'Execute a prepared merge after all conflicts are resolved. Commits the merge draft.\n\n' +
    'Prerequisites:\n' +
    '- All conflicts must be resolved via t3x_merge_resolve\n' +
    '- Or merge had zero conflicts from t3x_merge_prepare\n\n' +
    'Returns the merge commit hash and resolution log.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Merge draft ID from t3x_merge_prepare' },
      message: { type: 'string', description: 'Merge commit message' },
      branch: {
        type: 'string',
        description: 'Target branch (optional, defaults to target branch from prepare)',
      },
    },
    required: ['draft_id', 'message'],
  },
};

export async function handleMergeExecute(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.commitMergeDraft(args.draft_id as string, {
    message: args.message as string,
    branch: args.branch as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
