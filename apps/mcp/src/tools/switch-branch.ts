import { getClient } from '../client.js';

export const switchBranchTool = {
  name: 't3x_switch_branch',
  description: 'Switch the active branch for a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      branch: { type: 'string', description: 'Branch name to switch to' },
    },
    required: ['project_id', 'branch'],
  },
};

export async function handleSwitchBranch(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.switchBranch(args.project_id as string, args.branch as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
