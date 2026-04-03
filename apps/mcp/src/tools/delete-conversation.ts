import { getClient } from '../client.js';

export const deleteConversationTool = {
  name: 't3x_delete_conversation',
  description: 'Delete a conversation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: { type: 'string', description: 'Conversation ID to delete' },
    },
    required: ['conversation_id'],
  },
};

export async function handleDeleteConversation(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteConversation(args.conversation_id as string);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ deleted: true, conversation_id: args.conversation_id }),
      },
    ],
  };
}
