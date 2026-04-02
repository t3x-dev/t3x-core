import { getClient } from '../client.js';

export const exportTool = {
  name: 't3x_export',
  description: 'Export project data as a ledger (text format with full commit history).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      branch: { type: 'string', description: 'Branch to export (default: main)' },
    },
    required: ['project_id'],
  },
};

export async function handleExport(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.exportLedger({
    project_id: args.project_id as string,
    branch: args.branch as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: result }] };
}
