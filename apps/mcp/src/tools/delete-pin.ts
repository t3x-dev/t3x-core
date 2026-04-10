import { getClient } from '../client.js';

export const deletePinTool = {
  name: 't3x_delete_pin',
  description: 'Remove a pin. The underlying conversation or leaf is not affected.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pin_id: { type: 'string', description: 'Pin ID to delete' },
    },
    required: ['pin_id'],
  },
};

export async function handleDeletePin(args: Record<string, unknown>) {
  const client = getClient();
  await client.deletePin(args.pin_id as string);
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ deleted: true, pin_id: args.pin_id }) },
    ],
  };
}
