'use client';

import type { SemanticContent } from '@t3x/core';
import { useCallback, useState } from 'react';
import { FrameMergeView } from '@/components/frame-graph';
import { Badge } from '@/components/ui/badge';

interface FrameMergeSectionProps {
  base: SemanticContent;
  source: SemanticContent;
  target: SemanticContent;
  mergeId?: string;
  className?: string;
}

export function FrameMergeSection({
  base,
  source,
  target,
  mergeId,
  className,
}: FrameMergeSectionProps) {
  const [resolvedSemantic, setResolvedSemantic] = useState<SemanticContent | null>(null);

  const handleResolved = useCallback((result: SemanticContent) => {
    setResolvedSemantic(result);
  }, []);

  return (
    <div className={className}>
      {resolvedSemantic && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
          <Badge variant="secondary">{resolvedSemantic.frames.length} frames</Badge>
          <span>Frame merge resolved</span>
        </div>
      )}
      <FrameMergeView
        base={base}
        source={source}
        target={target}
        onResolved={handleResolved}
        mergeId={mergeId}
      />
    </div>
  );
}
