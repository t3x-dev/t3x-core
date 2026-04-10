import { getClient } from '../client.js';

export const mergePrepareTool = {
  name: 't3x_merge_prepare',
  description:
    'Prepare a merge between two commits. Creates a server-side merge draft and returns:\n' +
    '- draft_id: use for subsequent merge operations\n' +
    '- summary: counts of auto-kept, conflicts, source-only, target-only items\n' +
    '- conflicts: list with index, path, and conflicting slot keys\n\n' +
    'Next steps:\n' +
    '- If conflicts = 0: call t3x_merge_execute directly\n' +
    '- If conflicts > 0: use t3x_merge_show_conflict to inspect, t3x_merge_resolve to resolve, then t3x_merge_execute\n' +
    '- To cancel: call t3x_merge_abort',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      source_hash: { type: 'string', description: 'Source commit hash (sha256:...)' },
      target_hash: { type: 'string', description: 'Target commit hash (sha256:...)' },
      source_branch: { type: 'string', description: 'Source branch name (optional, for metadata)' },
      target_branch: { type: 'string', description: 'Target branch name (optional, for metadata)' },
    },
    required: ['project_id', 'source_hash', 'target_hash'],
  },
};

export async function handleMergePrepare(args: Record<string, unknown>) {
  const client = getClient();
  const draft = await client.createMergeDraft({
    project_id: args.project_id as string,
    source_hash: args.source_hash as string,
    target_hash: args.target_hash as string,
    source_branch: args.source_branch as string | undefined,
    target_branch: args.target_branch as string | undefined,
  });

  const prepared = draft.prepared;
  const conflicts = (prepared.conflicts || []).map(
    (c: { path: string; slotConflicts: Array<{ key: string }> }, i: number) => ({
      index: i,
      path: c.path,
      slot_keys: c.slotConflicts.map((sc: { key: string }) => sc.key),
    })
  );

  const result = {
    draft_id: draft.draftId,
    status: draft.status,
    summary: {
      auto_kept: (prepared.autoKept || []).length,
      conflicts: conflicts.length,
      only_in_source: (prepared.onlyInSource || []).length,
      only_in_target: (prepared.onlyInTarget || []).length,
    },
    conflicts,
    only_in_source: prepared.onlyInSource || [],
    only_in_target: prepared.onlyInTarget || [],
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
