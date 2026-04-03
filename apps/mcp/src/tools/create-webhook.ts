import { getClient } from '../client.js';

export const createWebhookTool = {
  name: 't3x_create_webhook',
  description: 'Create a webhook to receive event notifications.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'Webhook endpoint URL' },
      events: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event types to subscribe to (e.g., "commit.created", "leaf.generated")',
      },
      project_id: { type: 'string', description: 'Project ID (optional, global if omitted)' },
      secret: { type: 'string', description: 'HMAC secret for signature verification (optional)' },
    },
    required: ['url', 'events'],
  },
};

export async function handleCreateWebhook(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createWebhook({
    url: args.url as string,
    events: args.events as string[],
    project_id: args.project_id as string | undefined,
    secret: args.secret as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
