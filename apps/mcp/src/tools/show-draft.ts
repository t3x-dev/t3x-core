import { getClient } from '../client.js';

export const showDraftTool = {
  name: 't3x_show_draft',
  description:
    'Show the content of a draft (extracted knowledge). ' +
    'Returns trees with slot values and source quotes for traceability. ' +
    'Use after t3x_extract to review what was extracted before committing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Draft ID (from t3x_extract result)' },
    },
    required: ['draft_id'],
  },
};

export async function handleShowDraft(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.getDraft(args.draft_id as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
