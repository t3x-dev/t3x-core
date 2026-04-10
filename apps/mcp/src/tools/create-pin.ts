import { getClient } from '../client.js';

export const createPinTool = {
  name: 't3x_create_pin',
  description:
    'Pin a conversation or leaf as a source for commit context building. Pinned items contribute their content to the LLM context during generation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      type: {
        type: 'string',
        enum: ['conversation', 'leaf'],
        description: 'Type of entity to pin',
      },
      ref_id: { type: 'string', description: 'ID of the conversation or leaf to pin' },
      selected_assertion_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific assertion IDs to include from the pinned item',
      },
    },
    required: ['project_id', 'type', 'ref_id'],
  },
};

export async function handleCreatePin(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createPin(args.project_id as string, {
    type: args.type as 'conversation' | 'leaf',
    ref_id: args.ref_id as string,
    selected_assertion_ids: args.selected_assertion_ids as string[] | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
