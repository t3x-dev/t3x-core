import { getClient } from '../client.js';

export const createConversationTool = {
  name: 't3x_create_conversation',
  description:
    'Create a new conversation in a project. Optionally set an alias (snake_case, 1-64 chars) for human-friendly referencing in other tools.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      title: { type: 'string', description: 'Conversation title (optional)' },
      alias: {
        type: 'string',
        description: 'Snake_case alias for this conversation (optional, e.g. "quarterly_review")',
      },
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

  // If alias provided, set it after creation
  if (args.alias) {
    try {
      await client.renameConversation(result.conversation_id, {
        alias: args.alias as string,
      });
    } catch {
      // Alias setting is best-effort — conversation is already created
    }
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
