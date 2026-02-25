'use client';

/**
 * SimilarityBadge — shows similarity percentage with 3-tier coloring.
 *
 * Spec: frontend-art-template §6.6
 * - >=80% → added (green)
 * - >=50% → modified (amber)
 * - <50%  → removed (red)
 *
 * Uses --diff-* CSS tokens only.
 */

const tierSymbol = { added: '≈', modified: '~', removed: '≠' } as const;

export function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tier = value >= 0.8 ? 'added' : value >= 0.5 ? 'modified' : 'removed';

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-mono"
      style={{
        background: `var(--diff-${tier}-bg)`,
        color: `var(--diff-${tier}-text)`,
      }}
    >
      {tierSymbol[tier]} {pct}%
    </span>
  );
}
