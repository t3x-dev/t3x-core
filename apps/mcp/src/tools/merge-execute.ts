import { getClient } from '../client.js';

export const mergeExecuteTool = {
  name: 't3x_merge_execute',
  description:
    'Execute a prepared merge after all conflicts are resolved. Commits the merge draft.\n\n' +
    'Prerequisites:\n' +
    '- All conflicts must be resolved via t3x_merge_resolve\n' +
    '- Or merge had zero conflicts from t3x_merge_prepare\n\n' +
    'Returns the merge commit hash and resolution log.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Merge draft ID from t3x_merge_prepare' },
      message: { type: 'string', description: 'Merge commit message' },
      branch: {
        type: 'string',
        description: 'Target branch (optional, defaults to target branch from prepare)',
      },
    },
    required: ['draft_id', 'message'],
  },
};

export async function handleMergeExecute(args: Record<string, unknown>) {
  const client = getClient();
  const draftId = args.draft_id as string;

  // Read draft to get resolutions saved by merge_resolve (stored in prepared)
  const draft = await client.getMergeDraft(draftId);
  const prepared = draft.prepared as Record<string, unknown>;
  const resolutions = (prepared.resolutions as Array<{ path: string; resolution: string }>) || [];

  // Convert resolutions to API's decisions.conflictResolutions format
  const conflictResolutions: Record<string, string> = {};
  for (const r of resolutions) {
    if (typeof r.resolution === 'string') {
      conflictResolutions[r.path] = r.resolution;
    }
  }

  const result = await client.commitMergeDraft(draftId, {
    message: args.message as string,
    branch: args.branch as string | undefined,
    decisions: {
      conflictResolutions,
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    },
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
