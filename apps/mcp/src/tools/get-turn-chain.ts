import { getClient } from '../client.js';

export const getTurnChainTool = {
  name: 't3x_get_turn_chain',
  description: 'Get the full chain of turns leading to a specific turn (conversation thread).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      turn_hash: { type: 'string', description: 'Turn hash to trace back from (sha256:...)' },
    },
    required: ['turn_hash'],
  },
};

export async function handleGetTurnChain(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getTurnChain(args.turn_hash as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
