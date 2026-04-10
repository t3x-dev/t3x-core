import { getClient } from '../client.js';

export const listPinsTool = {
  name: 't3x_list_pins',
  description: 'List all pins for a project. Pins mark conversations or leaves as selected sources for commit context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
    },
    required: ['project_id'],
  },
};

export async function handleListPins(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listPins(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
