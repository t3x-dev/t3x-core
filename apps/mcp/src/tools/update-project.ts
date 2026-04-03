import { getClient } from '../client.js';

export const updateProjectTool = {
  name: 't3x_update_project',
  description: 'Update a project name or metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'New project name (optional)' },
      metadata: { type: 'object', description: 'New metadata (optional)' },
    },
    required: ['project_id'],
  },
};

export async function handleUpdateProject(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.updateProject(args.project_id as string, {
    name: args.name as string | undefined,
    metadata: args.metadata as Record<string, unknown> | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
