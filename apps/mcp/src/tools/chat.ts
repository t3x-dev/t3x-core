import { getClient } from '../client.js';

export const chatTool = {
  name: 't3x_chat',
  description:
    'Send a raw LLM chat message through T3X and get a response. This is a plain LLM call -- it does NOT extract or store knowledge. Use t3x_extract instead if you want to capture semantic knowledge from conversation text.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'The user message to send' },
      model: { type: 'string', description: 'LLM model to use (optional)' },
      provider: { type: 'string', description: 'LLM provider to use (optional)' },
    },
    required: ['message'],
  },
};

export async function handleChat(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.chat({
    messages: [{ role: 'user', content: args.message as string }],
    model: args.model as string | undefined,
    provider: args.provider as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
