'use client';

export interface KeyboardHint {
  key: string;
  label: string;
}

/**
 * Compact row of `<kbd>` hints, right-aligned by default.
 * Matches the style established in CommitDetailPage's lineage bar.
 */
export function KeyboardHintBar({ hints }: { hints: KeyboardHint[] }) {
  return (
    <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
      {hints.map((h) => (
        <span key={h.key + h.label} className="inline-flex items-center gap-1 text-[11px]">
          {h.key.split(' ').map((k) => (
            <kbd
              key={k}
              className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1 py-0.5 font-mono text-[9px]"
            >
              {k}
            </kbd>
          ))}
          <span>{h.label}</span>
        </span>
      ))}
    </div>
  );
}
