import { getClient } from '../client.js';

export const listConversationsTool = {
  name: 't3x_list_conversations',
  description: 'List conversations for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      limit: { type: 'number', description: 'Max results (default 20)' },
      offset: { type: 'number', description: 'Pagination offset' },
    },
    required: ['project_id'],
  },
};

export async function handleListConversations(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listConversations(args.project_id as string, {
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
