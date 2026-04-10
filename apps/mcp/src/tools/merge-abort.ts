import { getClient } from '../client.js';

export const mergeAbortTool = {
  name: 't3x_merge_abort',
  description: 'Abort a merge in progress. Deletes the merge draft and discards all resolutions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Merge draft ID to abort' },
    },
    required: ['draft_id'],
  },
};

export async function handleMergeAbort(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteMergeDraft(args.draft_id as string);
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ aborted: true, draft_id: args.draft_id }) },
    ],
  };
}
