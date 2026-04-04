import { getClient } from '../client.js';

export const editDraftTool = {
  name: 't3x_edit_draft',
  description:
    'Edit a draft by applying YOps (YAML Operations). ' +
    'Use t3x_yops_schema to see available operations. Common operations:\n' +
    '- define: create a new empty node (structure)\n' +
    '- populate: fill slots on an existing node (data)\n' +
    '- set: update a single slot value\n' +
    '- drop: remove a node and all children\n' +
    '- rename: rename a node key\n' +
    '- merge: combine multiple nodes into one\n' +
    'Use t3x_show_draft after editing to verify the result.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Draft ID' },
      yops: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of YOps to apply. Use t3x_yops_schema to see the format.',
      },
      if_revision: {
        type: 'number',
        description: 'Current draft revision (for optimistic locking). Get from t3x_show_draft.',
      },
    },
    required: ['draft_id', 'yops', 'if_revision'],
  },
};

export async function handleEditDraft(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.applyYOps(
    args.draft_id as string,
    args.yops as unknown[],
    args.if_revision as number
  );
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
