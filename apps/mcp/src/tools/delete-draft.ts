import { getClient } from '../client.js';

export const deleteDraftTool = {
  name: 't3x_delete_draft',
  description: 'Delete a draft.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Draft ID to delete' },
    },
    required: ['draft_id'],
  },
};

export async function handleDeleteDraft(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteDraft(args.draft_id as string);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ deleted: true, draft_id: args.draft_id }),
      },
    ],
  };
}
