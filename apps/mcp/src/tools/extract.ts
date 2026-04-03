import { getClient } from '../client.js';

export const extractTool = {
  name: 't3x_extract',
  description:
    'Extract semantic knowledge (sentences, entities, relations) from raw conversation text. Returns a draft_id that can be passed to show_draft or edit_draft for review before committing. Pass conversation_id for incremental extraction with drift detection.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      text: { type: 'string', description: 'Raw conversation text' },
      conversation_id: { type: 'string', description: 'Optional: for incremental extraction' },
      source: { type: 'string', description: 'Optional: source label' },
    },
    required: ['project_id', 'text'],
  },
};

export async function handleExtract(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.extract({
    project_id: args.project_id as string,
    text: args.text as string,
    conversation_id: args.conversation_id as string | undefined,
    source: args.source as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
