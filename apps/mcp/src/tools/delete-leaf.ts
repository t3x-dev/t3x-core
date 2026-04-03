import { getClient } from '../client.js';

export const deleteLeafTool = {
  name: 't3x_delete_leaf',
  description: 'Delete a leaf.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      leaf_id: { type: 'string', description: 'Leaf ID' },
    },
    required: ['leaf_id'],
  },
};

export async function handleDeleteLeaf(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteLeaf(args.leaf_id as string);
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ deleted: true, leaf_id: args.leaf_id }) },
    ],
  };
}
