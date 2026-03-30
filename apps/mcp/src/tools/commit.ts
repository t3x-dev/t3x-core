import { getClient } from '../client.js';

export const commitTool = {
  name: 't3x_commit',
  description:
    'Commit semantic knowledge as an immutable record. ' +
    'Two modes: (1) pass draft_id from a previous extract, or ' +
    '(2) pass content directly with trees/relations (for adjusted YAML).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      draft_id: { type: 'string', description: 'Draft ID from extract (mode 1)' },
      content: {
        type: 'object',
        description:
          'Semantic content to commit directly (mode 2). ' +
          'Shape: { trees: TreeNode[], relations?: Relation[] }',
        properties: {
          trees: { type: 'array', description: 'Array of tree nodes' },
          relations: { type: 'array', description: 'Array of relations (optional)' },
        },
        required: ['trees'],
      },
      message: { type: 'string', description: 'Commit message' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
    },
    required: ['project_id'],
  },
};

export async function handleCommit(args: Record<string, unknown>) {
  const client = getClient();
  const projectId = args.project_id as string;
  const message = args.message as string | undefined;
  const branch = args.branch as string | undefined;

  if (args.content) {
    // Mode 2: Direct content commit via POST /v1/commits
    const content = args.content as { trees: unknown[]; relations?: unknown[] };
    const result = await client.createCommit({
      project_id: projectId,
      content: {
        trees: content.trees,
        relations: content.relations ?? [],
      },
      message: message ?? 'MCP commit',
      branch: branch ?? 'main',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }

  if (args.draft_id) {
    // Mode 1: Commit from draft via POST /v1/commit
    const result = await client.commitFromDraft({
      project_id: projectId,
      draft_id: args.draft_id as string,
      message,
      branch,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error('Either draft_id or content must be provided');
}
