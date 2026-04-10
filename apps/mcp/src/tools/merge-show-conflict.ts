import { getClient } from '../client.js';

export const mergeShowConflictTool = {
  name: 't3x_merge_show_conflict',
  description:
    'Show full details of a single merge conflict for inspection before resolving.\n' +
    'Returns the complete source and target node data, slot-level conflicts, and context.\n' +
    'Use after t3x_merge_prepare to inspect each conflict before calling t3x_merge_resolve.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Merge draft ID from t3x_merge_prepare' },
      conflict_index: {
        type: 'number',
        description:
          'Index of the conflict to inspect (0-based, from t3x_merge_prepare conflicts list)',
      },
    },
    required: ['draft_id', 'conflict_index'],
  },
};

export async function handleMergeShowConflict(args: Record<string, unknown>) {
  const client = getClient();
  const draft = await client.getMergeDraft(args.draft_id as string);
  const conflicts = draft.prepared.conflicts || [];
  const index = args.conflict_index as number;

  if (index < 0 || index >= conflicts.length) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Invalid conflict_index: ${index}. Valid range: 0-${conflicts.length - 1}`,
          }),
        },
      ],
    };
  }

  const conflict = conflicts[index];
  const result = {
    index,
    path: conflict.path,
    slot_conflicts: conflict.slotConflicts.map(
      (sc: { key: string; sourceValue?: unknown; targetValue?: unknown }) => ({
        key: sc.key,
        source_value: sc.sourceValue,
        target_value: sc.targetValue,
      })
    ),
    total_conflicts: conflicts.length,
    resolution_options: ['source', 'target', 'both', 'edit'],
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
