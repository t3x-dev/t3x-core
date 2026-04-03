import { getClient } from '../client.js';

export const showLeafTool = {
  name: 't3x_show_leaf',
  description:
    'Show the full details of a leaf including constraints, config, output, and assertions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      leaf_id: { type: 'string', description: 'Leaf ID' },
    },
    required: ['leaf_id'],
  },
};

export async function handleShowLeaf(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getLeaf(args.leaf_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
