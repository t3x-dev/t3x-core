import { getClient } from '../client.js';

export const extractTool = {
  name: 't3x_extract',
  description:
    'Extract semantic knowledge from conversation text into a draft. ' +
    'Requires a conversation_id (alias or conv_xxx hash). ' +
    'If the conversation has no prior extraction, performs first extraction. ' +
    'If it has prior trees, performs incremental extraction with drift detection. ' +
    'Returns a draft_id for review (t3x_show_draft) and editing (t3x_apply_yops) before committing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      conversation_id: {
        type: 'string',
        description: 'Conversation ID (conv_xxx hash) or alias. Required.',
      },
      text: { type: 'string', description: 'Raw conversation text to extract from' },
      project_id: {
        type: 'string',
        description: 'Project ID — required when using alias instead of conv_xxx ID',
      },
      source: { type: 'string', description: 'Optional source label' },
    },
    required: ['conversation_id', 'text'],
  },
};

export async function handleExtract(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.extract({
    project_id: args.project_id as string,
    text: args.text as string,
    conversation_id: args.conversation_id as string,
    source: args.source as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
