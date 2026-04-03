import { getClient } from '../client.js';

export const listWebhooksTool = {
  name: 't3x_list_webhooks',
  description: 'List webhooks, optionally filtered by project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to filter by (optional, lists all if omitted)',
      },
    },
  },
};

export async function handleListWebhooks(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listWebhooks(args.project_id as string | undefined);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
