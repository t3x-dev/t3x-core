import { getClient } from '../client.js';

export const showProjectTool = {
  name: 't3x_show_project',
  description: 'Get detailed information about a project including stats.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
    },
    required: ['project_id'],
  },
};

export async function handleShowProject(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getProject(args.project_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
