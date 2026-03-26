import { getClient } from '../client.js';

export const showTool = {
  name: 't3x_show',
  description: 'Show the current semantic knowledge for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
      format: {
        type: 'string',
        enum: ['json', 'yaml'],
        description: 'Output format (default: json)',
      },
    },
    required: ['project_id'],
  },
};

export async function handleShow(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.context(args.project_id as string, {
    branch: args.branch as string | undefined,
    format: args.format as 'json' | 'yaml' | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
