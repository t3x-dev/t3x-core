'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import { MergeView } from '@/components/tree-graph';
import { Badge } from '@/components/ui/badge';

interface MergeSectionProps {
  base: SemanticContent;
  source: SemanticContent;
  target: SemanticContent;
  mergeId?: string;
  className?: string;
}

export function MergeSection({
  base,
  source,
  target,
  mergeId,
  className,
}: MergeSectionProps) {
  const [resolvedSemantic, setResolvedSemantic] = useState<SemanticContent | null>(null);

  const handleResolved = useCallback((result: SemanticContent) => {
    setResolvedSemantic(result);
  }, []);

  return (
    <div className={className}>
      {resolvedSemantic && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--status-success-muted)] border border-[var(--status-success)]/30 text-sm text-[var(--status-success)]">
          <Badge variant="secondary">{resolvedSemantic.trees.length} trees</Badge>
          <span>Tree merge resolved</span>
        </div>
      )}
      <MergeView
        base={base}
        source={source}
        target={target}
        onResolved={handleResolved}
        mergeId={mergeId}
      />
    </div>
  );
}
