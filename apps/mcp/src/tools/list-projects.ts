import { getClient } from '../client.js';

export const listProjectsTool = {
  name: 't3x_list_projects',
  description: 'List all projects. Returns project ID, name, description, and commit count.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Max results (default 20)' },
      offset: { type: 'number', description: 'Pagination offset' },
    },
  },
};

export async function handleListProjects(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.listProjects({
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
