import { getClient } from '../client.js';

export const generateTool = {
  name: 't3x_generate',
  description: 'Generate output text from a leaf using committed knowledge as context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      leaf_id: { type: 'string', description: 'Leaf ID' },
      model: { type: 'string', description: 'Optional: model to use' },
      provider: { type: 'string', description: 'Optional: provider to use' },
    },
    required: ['leaf_id'],
  },
};

export async function handleGenerate(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.generateLeaf(args.leaf_id as string, {
    model: args.model as string | undefined,
    provider: args.provider as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
