import { getClient } from '../client.js';

export const deleteProjectTool = {
  name: 't3x_delete_project',
  description: 'Delete a project (soft delete by default, use permanent flag for hard delete).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      permanent: {
        type: 'boolean',
        description: 'Permanently delete (default: false, soft delete)',
      },
    },
    required: ['project_id'],
  },
};

export async function handleDeleteProject(args: Record<string, unknown>) {
  const client = getClient();
  await client.deleteProject(args.project_id as string, {
    permanent: args.permanent as boolean | undefined,
  });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ deleted: true, project_id: args.project_id }),
      },
    ],
  };
}
