import { getClient } from '../client.js';

export const createProjectTool = {
  name: 't3x_create_project',
  description: 'Create a new project to store semantic knowledge.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Project name' },
      description: { type: 'string', description: 'Project description (optional)' },
    },
    required: ['name'],
  },
};

export async function handleCreateProject(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createProject({
    name: args.name as string,
    description: args.description as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
