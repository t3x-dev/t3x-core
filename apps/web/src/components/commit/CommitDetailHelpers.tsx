'use client';

/**
 * CommitDetailHelpers — shared small components for the commit detail page.
 *
 * Includes: CopyButton, StatusBadge, ConfidenceBadge, GutterBar, DotIndicator,
 * useCountUp hook, relativeTime helper.
 */

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { relativeTime, shortHash } from '@/domain/format/formatters';

export { useCountUp } from '@/hooks/shared/useCountUp';
export { relativeTime, shortHash };

// ============================================================================
// CopyButton
// ============================================================================

export function CopyButton({ text, size = 14 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {}); // Silently fail on clipboard permission denial
      }}
      className="inline-flex items-center justify-center rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
      title="Copy"
    >
      {copied ? (
        <Check size={size} className="text-[var(--status-success)]" />
      ) : (
        <Copy size={size} />
      )}
    </button>
  );
}

// ============================================================================
// StatusBadge
// ============================================================================

const statusStyles: Record<string, string> = {
  identical: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
  same: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
  modified:
    'border-[var(--diff-modified-accent)]/40 text-[var(--diff-modified-accent)] bg-[var(--diff-modified-bg)]',
  added:
    'border-[var(--diff-added-accent)]/40 text-[var(--diff-added-accent)] bg-[var(--diff-added-bg)]',
  removed:
    'border-[var(--diff-removed-accent)]/40 text-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)]',
};

const statusLabels: Record<string, string> = {
  identical: 'same',
  same: 'same',
  modified: '~modified',
  added: '+added',
  removed: '-removed',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles[status] || statusStyles.identical}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}

// ============================================================================
// DotIndicator
// ============================================================================

const dotColors: Record<string, string> = {
  identical: 'bg-[var(--text-tertiary)]/30',
  same: 'bg-[var(--text-tertiary)]/30',
  modified: 'bg-[var(--diff-modified-accent)]',
  added: 'bg-[var(--diff-added-accent)]',
  removed: 'bg-[var(--diff-removed-accent)]',
};

export function DotIndicator({ status }: { status: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[status] || dotColors.identical}`}
    />
  );
}

// ============================================================================
// ConfidenceBadge
// ============================================================================

export function ConfidenceBadge({ value, pulse = false }: { value: number; pulse?: boolean }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 90
      ? 'text-[var(--status-success)]'
      : pct >= 80
        ? 'text-[var(--status-warning)]'
        : 'text-[var(--status-error)]';
  return <span className={`font-mono text-[10px] ${color}`}>{pct}%</span>;
}

// ============================================================================
// GutterBar — colored left edge bar on node cards
// ============================================================================

const gutterColors: Record<string, string> = {
  identical: 'bg-[var(--text-tertiary)]/15',
  same: 'bg-[var(--text-tertiary)]/15',
  modified: 'bg-[var(--diff-modified-accent)]',
  added: 'bg-[var(--diff-added-accent)]',
  removed: 'bg-[var(--diff-removed-accent)]',
};

export function GutterBar({ status }: { status: string }) {
  return (
    <div
      className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg ${gutterColors[status] || gutterColors.identical}`}
    />
  );
}
