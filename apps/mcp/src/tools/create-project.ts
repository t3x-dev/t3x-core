import { getClient } from '../client.js';

export const createProjectTool = {
  name: 't3x_create_project',
  description: 'Create a new project to store semantic knowledge.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Project name' },
      metadata: { type: 'object', description: 'Project metadata (optional key-value pairs)' },
    },
    required: ['name'],
  },
};

export async function handleCreateProject(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createProject({
    name: args.name as string,
    metadata: args.metadata as Record<string, unknown> | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
