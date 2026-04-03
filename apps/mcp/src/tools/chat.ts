import { getClient } from '../client.js';

export const chatTool = {
  name: 't3x_chat',
  description:
    'Send a chat message through T3X. Lets agents have LLM conversations with semantic extraction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      message: { type: 'string', description: 'The chat message to send' },
      conversation_id: {
        type: 'string',
        description: 'Conversation ID to continue (optional, creates new if omitted)',
      },
      model: { type: 'string', description: 'LLM model to use (optional)' },
      provider: { type: 'string', description: 'LLM provider to use (optional)' },
    },
    required: ['project_id', 'message'],
  },
};

export async function handleChat(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.chat({
    project_id: args.project_id as string,
    message: args.message as string,
    conversation_id: args.conversation_id as string | undefined,
    model: args.model as string | undefined,
    provider: args.provider as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
