import { getClient } from '../client.js';

export const commitTool = {
  name: 't3x_commit',
  description: 'Commit reviewed YAML as an immutable semantic record.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      draft_id: { type: 'string', description: 'Draft ID from extract' },
      message: { type: 'string', description: 'Commit message' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
    },
    required: ['project_id', 'draft_id'],
  },
};

export async function handleCommit(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.commitFromDraft({
    project_id: args.project_id as string,
    draft_id: args.draft_id as string,
    message: args.message as string | undefined,
    branch: args.branch as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
