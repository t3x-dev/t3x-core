import { getClient } from '../client.js';

export const mergeExecuteTool = {
  name: 't3x_merge_execute',
  description:
    'Execute a merge with user decisions. Requires the prepared result from t3x_merge_prepare. ' +
    'Provide decisions for conflicts (source/target/both/edit) and which onlyInSource/onlyInTarget items to keep.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_hash: { type: 'string', description: 'Source commit hash' },
      target_hash: { type: 'string', description: 'Target commit hash' },
      prepared: { type: 'object', description: 'The prepared merge result from t3x_merge_prepare' },
      decisions: {
        type: 'object',
        description:
          'Merge decisions: { conflict_resolutions: [{index, pick: "source"|"target"|"both"|"edit", edited_text?}], keep_only_in_source: boolean[], keep_only_in_target: boolean[] }',
      },
      message: { type: 'string', description: 'Merge commit message' },
      branch: { type: 'string', description: 'Target branch (optional)' },
    },
    required: ['source_hash', 'target_hash', 'prepared', 'decisions', 'message'],
  },
};

export async function handleMergeExecute(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.executeMerge({
    source_hash: args.source_hash as string,
    target_hash: args.target_hash as string,
    prepared: args.prepared,
    decisions: args.decisions,
    message: args.message as string,
    branch: args.branch as string | undefined,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
