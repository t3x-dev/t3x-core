import { getClient } from '../client.js';

export const createShareTool = {
  name: 't3x_create_share',
  description: 'Create a share token for sharing a project, commit, or leaf via link.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      entity_type: {
        type: 'string',
        description: 'Type of entity to share (e.g., "project", "commit", "leaf")',
      },
      entity_id: { type: 'string', description: 'ID of the entity to share' },
      expires_in_hours: {
        type: 'number',
        description: 'Token expiration in hours (optional, default varies by server)',
      },
    },
    required: ['entity_type', 'entity_id'],
  },
};

export async function handleCreateShare(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createShareToken({
    entity_type: args.entity_type as string,
    entity_id: args.entity_id as string,
    expires_in_hours: args.expires_in_hours as number | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
