'use client';

import { DiffGutter } from './DiffGutter';
import { SimilarityBadge } from './SimilarityBadge';

/**
 * DiffRow — atomic row for unified diff display.
 *
 * Spec: frontend-art-template §6.2
 * Layout: DiffGutter | type indicator (+/−/~/space) | content | optional SimilarityBadge
 * Uses --diff-* CSS tokens for backgrounds and borders.
 */

interface DiffRowProps {
  lineNumber?: number;
  type: 'identical' | 'modified' | 'added' | 'removed';
  children: React.ReactNode;
  similarity?: number; // 0-1, only for modified
}

const typeIndicator: Record<DiffRowProps['type'], string> = {
  added: '+',
  removed: '\u2212', // minus sign
  modified: '~',
  identical: ' ',
};

export function DiffRow({ lineNumber, type, children, similarity }: DiffRowProps) {
  return (
    <div className="flex">
      <DiffGutter lineNumber={lineNumber} />
      <div
        className="w-6 shrink-0 select-none py-1 text-center font-mono text-xs"
        style={{ color: `var(--diff-${type}-accent)` }}
      >
        {typeIndicator[type]}
      </div>
      <div
        className="flex-1 px-3 py-1"
        style={{
          background: `var(--diff-${type}-bg)`,
          borderLeft: type !== 'identical' ? `2px solid var(--diff-${type}-border)` : 'none',
        }}
      >
        {children}
      </div>
      {similarity != null && (
        <div className="shrink-0 px-3 py-1">
          <SimilarityBadge value={similarity} />
        </div>
      )}
    </div>
  );
}
