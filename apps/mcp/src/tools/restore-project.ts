import { getClient } from '../client.js';

export const restoreProjectTool = {
  name: 't3x_restore_project',
  description: 'Restore a soft-deleted project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID to restore' },
    },
    required: ['project_id'],
  },
};

export async function handleRestoreProject(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.restoreProject(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
