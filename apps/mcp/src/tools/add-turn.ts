import { getClient } from '../client.js';

export const addTurnTool = {
  name: 't3x_add_turn',
  description:
    'Add a turn (message) to a conversation. Use role "user" or "assistant". ' +
    'Turns form a hash chain for integrity verification.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: { type: 'string', description: 'Conversation ID' },
      role: {
        type: 'string',
        enum: ['user', 'assistant', 'system', 'tool'],
        description: 'Message role',
      },
      content: { type: 'string', description: 'Message content' },
      parent_turn_hash: {
        type: 'string',
        description: 'Parent turn hash for chaining (optional, auto-detected)',
      },
    },
    required: ['conversation_id', 'role', 'content'],
  },
};

export async function handleAddTurn(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createTurn({
    conversation_id: args.conversation_id as string,
    role: args.role as 'user' | 'assistant' | 'system' | 'tool',
    content: args.content as string,
    parent_turn_hash: args.parent_turn_hash as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
