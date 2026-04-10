import { getClient } from '../client.js';

export const mergeResolveTool = {
  name: 't3x_merge_resolve',
  description:
    'Resolve one or more merge conflicts with reasoning. Each resolution records your decision and rationale.\n\n' +
    'Resolution types:\n' +
    '- "source": keep the source version\n' +
    '- "target": keep the target version\n' +
    '- "both": keep both as separate entries\n' +
    '- { edit: { slots: { ... } } }: custom merged content\n\n' +
    'The reasoning field is required — it captures why this decision was made for audit.\n' +
    'Supports batch: pass multiple resolutions in one call to reduce round-trips.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: { type: 'string', description: 'Merge draft ID' },
      resolutions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Conflict node path (from t3x_merge_show_conflict)',
            },
            resolution: {
              description: '"source", "target", "both", or { edit: { slots: { ... } } }',
            },
            reasoning: { type: 'string', description: 'Why this resolution was chosen (required)' },
          },
          required: ['path', 'resolution', 'reasoning'],
        },
        description: 'Array of conflict resolutions (supports batch)',
      },
    },
    required: ['draft_id', 'resolutions'],
  },
};

export async function handleMergeResolve(args: Record<string, unknown>) {
  const client = getClient();
  const draftId = args.draft_id as string;
  const resolutions = args.resolutions as Array<{
    path: string;
    resolution: string | { edit: { slots: Record<string, unknown> } };
    reasoning: string;
  }>;

  // Get current draft to read existing resolutions and conflict count
  const draft = await client.getMergeDraft(draftId);
  const prepared = draft.prepared as Record<string, unknown>;
  const existingResolutions = (prepared.resolutions as Array<{ path: string }>) || [];

  // Build resolution log entries
  const now = new Date().toISOString();
  const newResolutions = resolutions.map((r) => ({
    path: r.path,
    resolution: r.resolution,
    reasoning: r.reasoning,
    resolved_at: now,
  }));

  // Merge with existing (newer overwrites same path)
  const resolvedPaths = new Set(newResolutions.map((r) => r.path));
  const merged = [
    ...existingResolutions.filter((r) => !resolvedPaths.has(r.path)),
    ...newResolutions,
  ];

  // Store resolutions inside prepared (PATCH endpoint accepts prepared field)
  await client.updateMergeDraft(draftId, {
    prepared: { ...prepared, resolutions: merged },
  });

  // Count remaining unresolved conflicts
  const totalConflicts = (draft.prepared.conflicts || []).length;
  const resolvedCount = merged.length;
  const remaining = Math.max(0, totalConflicts - resolvedCount);

  const result = {
    resolved: true,
    resolutions_applied: newResolutions.length,
    remaining_conflicts: remaining,
    resolution_log: newResolutions,
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
