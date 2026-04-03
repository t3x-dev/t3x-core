import { getClient } from '../client.js';

export const mergeExecuteTool = {
  name: 't3x_merge_execute',
  description:
    'Execute a merge using the prepared result from t3x_merge_prepare. Decisions must include: conflict_resolutions (array of {index, pick: "source"|"target"|"both"|"edit", edited_text?} for each conflict), keep_only_in_source (boolean[] -- true to include each source-only sentence), and keep_only_in_target (boolean[] -- true to include each target-only sentence). Returns the new merge commit hash.',
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
