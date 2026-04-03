import { getClient } from '../client.js';

export const getConversationTool = {
  name: 't3x_get_conversation',
  description: 'Get detailed information about a conversation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: { type: 'string', description: 'Conversation ID' },
    },
    required: ['conversation_id'],
  },
};

export async function handleGetConversation(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getConversation(args.conversation_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
