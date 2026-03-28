/**
 * YOps Format — YAML serialization and deserialization for YOp arrays.
 *
 * Used for human-readable logging and LLM round-tripping of operations.
 */

import * as yaml from 'js-yaml';
import type { YOp } from './types';

/**
 * Serialize a YOp array to a YAML string under a `yops:` key.
 */
export function formatYOpsLog(ops: YOp[]): string {
  return yaml.dump(
    { yops: ops },
    {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    },
  );
}

/**
 * Parse a YAML string containing a `yops:` array back into YOp[].
 * Throws if the document is missing the `yops` array.
 */
export function parseYOpsYaml(yamlStr: string): YOp[] {
  const doc = yaml.load(yamlStr) as { yops?: unknown[] } | undefined | null;
  if (!doc || !Array.isArray(doc.yops)) {
    throw new Error('Invalid YOps document: missing yops array');
  }
  return doc.yops as YOp[];
}
