import { getClient } from '../client.js';

export const listTurnsTool = {
  name: 't3x_list_turns',
  description: 'List turns in a conversation. Returns turn hashes, roles, and content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: { type: 'string', description: 'Conversation ID' },
      limit: { type: 'number', description: 'Max results (default 20)' },
      offset: { type: 'number', description: 'Pagination offset' },
    },
    required: ['conversation_id'],
  },
};

export async function handleListTurns(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listTurns(args.conversation_id as string, {
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
