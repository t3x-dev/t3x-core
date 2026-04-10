import { getClient } from '../client.js';

export const renameConversationTool = {
  name: 't3x_rename_conversation',
  description:
    'Set or change the alias of a conversation. Alias must be snake_case, 1-64 characters, lowercase letter start. Alias must be unique within the project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: { type: 'string', description: 'Conversation ID (conv_xxx)' },
      alias: { type: 'string', description: 'New alias (snake_case, e.g. "budget_review")' },
    },
    required: ['conversation_id', 'alias'],
  },
};

export async function handleRenameConversation(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.renameConversation(args.conversation_id as string, {
    alias: args.alias as string,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
