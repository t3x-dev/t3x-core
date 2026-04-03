import { getClient } from '../client.js';

export const generateTool = {
  name: 't3x_generate',
  description:
    'Generate output text from a leaf by sending its committed knowledge and constraints to an LLM. The leaf must already exist (use t3x_create_leaf) and be attached to a commit with sentences. Returns the generated text and assertion results for each constraint.',
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
