import { getClient } from '../client.js';

export const deleteWebhookTool = {
  name: 't3x_delete_webhook',
  description: 'Delete a webhook.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      webhook_id: { type: 'string', description: 'Webhook ID to delete' },
    },
    required: ['webhook_id'],
  },
};

export async function handleDeleteWebhook(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteWebhook(args.webhook_id as string);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ deleted: true, webhook_id: args.webhook_id }),
      },
    ],
  };
}
