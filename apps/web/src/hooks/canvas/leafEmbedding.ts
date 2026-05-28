import type { Leaf } from '@/types/api';
import type { EmbeddedLeaf } from '@/types/nodes';

export function toEmbeddedLeaf(leaf: Leaf): EmbeddedLeaf {
  const assertions = leaf.runner_assertions ?? leaf.assertions ?? [];
  const failedCount = assertions.filter((assertion) => !assertion.passed).length;
  const passedCount = assertions.length - failedCount;
  const status: EmbeddedLeaf['status'] =
    assertions.length > 0
      ? failedCount > 0
        ? 'failed'
        : 'passed'
      : leaf.output || leaf.generated_at
        ? 'idle'
        : 'pending';

  return {
    id: leaf.id,
    type: leaf.type,
    title: leaf.title || leaf.type,
    status,
    passedCount,
    failedCount,
    createdAt: leaf.created_at,
  };
}
