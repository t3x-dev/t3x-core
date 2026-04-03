import { getClient } from '../client.js';

export const listProvidersTool = {
  name: 't3x_list_providers',
  description: 'List available LLM chat providers and their models.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleListProviders(_args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listChatProviders();
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
