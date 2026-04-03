import { getClient } from '../client.js';

export const createLeafTool = {
  name: 't3x_create_leaf',
  description:
    'Create a leaf -- an output template attached to a commit that defines how knowledge should be rendered (e.g., as a tweet, email, or article). After creation, add "require" or "exclude" constraints to control content, then use t3x_generate to produce output. Returns the new leaf_id.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      commit_hash: { type: 'string', description: 'Commit to attach to' },
      type: { type: 'string', description: 'Leaf type (e.g. deploy_agent, tweet, email, article)' },
      title: { type: 'string', description: 'Leaf title' },
    },
    required: ['project_id', 'commit_hash', 'type', 'title'],
  },
};

export async function handleCreateLeaf(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.createLeaf({
    project_id: args.project_id as string,
    commit_hash: args.commit_hash as string,
    type: args.type as string,
    title: args.title as string,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
