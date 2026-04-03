import { getClient } from '../client.js';

export const createConversationTool = {
  name: 't3x_create_conversation',
  description: 'Create a new conversation in a project for importing turns.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      title: { type: 'string', description: 'Conversation title (optional)' },
    },
    required: ['project_id'],
  },
};

export async function handleCreateConversation(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createConversation({
    project_id: args.project_id as string,
    title: args.title as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
