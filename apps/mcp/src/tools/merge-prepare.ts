import { getClient } from '../client.js';

export const mergePrepareTool = {
  name: 't3x_merge_prepare',
  description:
    'Prepare a three-way merge between two commits. Returns: autoKept (identical sentences kept automatically), conflicts (similar sentences needing resolution -- pick source, target, both, or edit), onlyInSource (sentences unique to source), and onlyInTarget (sentences unique to target). ' +
    'Call this before t3x_merge_execute to understand what needs resolution.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_hash: { type: 'string', description: 'Source commit hash (sha256:...)' },
      target_hash: { type: 'string', description: 'Target commit hash (sha256:...)' },
    },
    required: ['source_hash', 'target_hash'],
  },
};

export async function handleMergePrepare(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.prepareMerge({
    source_hash: args.source_hash as string,
    target_hash: args.target_hash as string,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
