import { getClient } from '../client.js';

export const getTurnTool = {
  name: 't3x_get_turn',
  description: 'Get a specific turn (message) by its hash.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      turn_hash: { type: 'string', description: 'Turn hash (sha256:...)' },
    },
    required: ['turn_hash'],
  },
};

export async function handleGetTurn(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getTurn(args.turn_hash as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
