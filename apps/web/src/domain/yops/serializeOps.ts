import type { SourcedYOp } from '@t3x-dev/core';
import * as yaml from 'js-yaml';

export function serializeOpsToYaml(ops: readonly SourcedYOp[]): string {
  if (ops.length === 0) return '';
  const stripped = ops.map((op) => {
    const { source, ...rest } = op as Record<string, unknown>;
    return rest;
  });
  return yaml.dump({ yops: stripped }, { lineWidth: -1, noRefs: true });
}
