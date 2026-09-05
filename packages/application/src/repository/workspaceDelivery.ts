/** Pure compatibility projection. Tags and prose never select executable adapters. */
export function resolveWorkspaceDeliveryTarget(target: Record<string, unknown>) {
  if (target.type !== 'export' || (target.format !== 'yaml' && target.format !== 'json')) {
    return {
      mode: 'legacy' as const,
      reason: 'This target requires generation or an unavailable adapter.',
    };
  }
  if (
    target.instruction ||
    target.sourceScope ||
    target.leafType ||
    (Array.isArray(target.constraints) && target.constraints.length > 0)
  ) {
    return {
      mode: 'legacy' as const,
      reason:
        'This target includes generation instructions or a source selection that cannot be applied to a full State download.',
    };
  }
  return {
    mode: 'download' as const,
    adapter: 't3x.download/v1' as const,
    format: target.format as 'json' | 'yaml',
    scope: 'full-state-value' as const,
  };
}

export const WORKSPACE_STATE_DOWNLOAD_TARGET = 't3x:committed-state';
