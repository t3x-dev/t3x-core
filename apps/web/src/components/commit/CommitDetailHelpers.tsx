'use client';

/**
 * CommitDetailHelpers — shared small components for the commit detail page.
 *
 * Includes: CopyButton, StatusBadge, ConfidenceBadge, GutterBar, DotIndicator,
 * MiniProvenance, WordDiffInline, useCountUp hook, relativeTime helper.
 */

import { Bot, Check, Copy, GitCommit, User } from 'lucide-react';
import { useState } from 'react';
import { relativeTime, shortHash } from '@/lib/formatters';

export { useCountUp } from '@/hooks/useCountUp';
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
  return (
    <span
      className={`font-mono text-[10px] ${color} ${pulse && pct >= 95 ? 'confidence-pulse' : ''}`}
    >
      {pct}%
    </span>
  );
}

// ============================================================================
// GutterBar — colored left edge bar on sentence cards
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

// ============================================================================
// MiniProvenance — tiny SVG provenance chain icon
// ============================================================================

export function MiniProvenance({ status }: { status: string }) {
  const dotColor =
    status === 'added'
      ? 'var(--diff-added-accent)'
      : status === 'modified'
        ? 'var(--diff-modified-accent)'
        : status === 'removed'
          ? 'var(--diff-removed-accent)'
          : 'var(--text-tertiary)';
  return (
    <svg
      width="52"
      height="12"
      viewBox="0 0 52 12"
      className="opacity-50"
      role="img"
      aria-label="Provenance chain: source → commit → leaf"
    >
      <circle cx="6" cy="6" r="3" fill="var(--accent-conversation)" opacity="0.6" />
      <line
        x1="9"
        y1="6"
        x2="19"
        y2="6"
        stroke="var(--stroke-default)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle cx="22" cy="6" r="3.5" fill={dotColor} className="provenance-dot" />
      <line
        x1="25.5"
        y1="6"
        x2="35"
        y2="6"
        stroke="var(--stroke-default)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle cx="38" cy="6" r="3" fill="var(--accent-leaf)" opacity="0.6" />
      <text
        x="6"
        y="11"
        textAnchor="middle"
        fontSize="4"
        fill="var(--text-tertiary)"
        className="select-none"
      >
        src
      </text>
      <text
        x="22"
        y="11"
        textAnchor="middle"
        fontSize="4"
        fill="var(--text-tertiary)"
        className="select-none"
      >
        cmt
      </text>
      <text
        x="38"
        y="11"
        textAnchor="middle"
        fontSize="4"
        fill="var(--text-tertiary)"
        className="select-none"
      >
        leaf
      </text>
    </svg>
  );
}

// ============================================================================
// WordDiffInline — inline word-level diff display
// ============================================================================

export function WordDiffInline({
  oldText,
  newText,
  segments,
}: {
  oldText: string;
  newText: string;
  segments?: import('@t3x-dev/core').WordDiffSegment[];
}) {
  // When LCS-based segments are available from the diff engine, use them
  // for accurate word-level highlighting. Fall back to naive set comparison.
  if (segments && segments.length > 0) {
    return (
      <div className="mt-2 rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)] p-3 font-mono text-[12px] leading-relaxed">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Word diff
        </div>
        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
          {segments
            .filter((s) => s.type !== 'removed')
            .map((s, i) => (
              <span
                key={`n-${i}`}
                className={
                  s.type === 'added'
                    ? 'rounded bg-[var(--diff-added-bg)] px-0.5 text-[var(--diff-added-text)]'
                    : 'text-[var(--text-secondary)]'
                }
              >
                {s.text}
              </span>
            ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 opacity-60">
          {segments
            .filter((s) => s.type !== 'added')
            .map((s, i) => (
              <span
                key={`o-${i}`}
                className={
                  s.type === 'removed'
                    ? 'rounded bg-[var(--diff-removed-bg)] px-0.5 text-[var(--diff-removed-text)] line-through'
                    : 'text-[var(--text-tertiary)]'
                }
              >
                {s.text}
              </span>
            ))}
        </div>
      </div>
    );
  }

  // Fallback: sequential word diff (index-based, respects position and multiplicity)
  const oldWords = oldText.split(/\s+/);
  const newWords = newText.split(/\s+/);

  const result: Array<{ text: string; type: 'same' | 'added' | 'removed' }> = [];
  let i = 0;
  let j = 0;
  while (i < oldWords.length && j < newWords.length) {
    if (oldWords[i] === newWords[j]) {
      result.push({ text: oldWords[i], type: 'same' });
      i++;
      j++;
    } else if (newWords.indexOf(oldWords[i], j) === -1) {
      result.push({ text: oldWords[i], type: 'removed' });
      i++;
    } else {
      result.push({ text: newWords[j], type: 'added' });
      j++;
    }
  }
  while (i < oldWords.length) {
    result.push({ text: oldWords[i++], type: 'removed' });
  }
  while (j < newWords.length) {
    result.push({ text: newWords[j++], type: 'added' });
  }

  return (
    <div className="mt-2 rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)] p-3 font-mono text-[12px] leading-relaxed">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        Word diff
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-0.5">
        {result
          .filter((w) => w.type !== 'removed')
          .map((w, i) => (
            <span
              key={`n-${i}`}
              className={
                w.type === 'added'
                  ? 'rounded bg-[var(--diff-added-bg)] px-0.5 text-[var(--diff-added-text)]'
                  : 'text-[var(--text-secondary)]'
              }
            >
              {w.text}
            </span>
          ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 opacity-60">
        {result
          .filter((w) => w.type !== 'added')
          .map((w, i) => (
            <span
              key={`o-${i}`}
              className={
                w.type === 'removed'
                  ? 'rounded bg-[var(--diff-removed-bg)] px-0.5 text-[var(--diff-removed-text)] line-through'
                  : 'text-[var(--text-tertiary)]'
              }
            >
              {w.text}
            </span>
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// SourceTurnPreview — inline source turn display
// ============================================================================

export function SourceTurnPreview({
  role,
  content,
  highlightStart,
  highlightEnd,
  conversationTitle,
}: {
  role: string;
  content: string;
  highlightStart: number;
  highlightEnd: number;
  conversationTitle?: string;
}) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--status-info)]/20 bg-[var(--status-info-muted)] p-3 source-expand-enter">
      <div className="mb-2 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
        <span
          className={`rounded-full p-1 ${
            role === 'user'
              ? 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
              : 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
          }`}
        >
          {role === 'user' ? <User size={9} /> : <Bot size={9} />}
        </span>
        <span className="font-medium">{role}</span>
        {conversationTitle && (
          <>
            <span>&middot;</span>
            <span>{conversationTitle}</span>
          </>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
        {content.slice(0, highlightStart)}
        <mark className="rounded bg-[var(--accent-commit)]/15 px-0.5 text-[var(--text-primary)]">
          {content.slice(highlightStart, highlightEnd)}
        </mark>
        {content.slice(highlightEnd)}
      </p>
    </div>
  );
}

// ============================================================================
// InheritedFrom — shows which parent commit a sentence was inherited from
// ============================================================================

export function InheritedFromBadge({
  parentHash,
  projectId,
}: {
  parentHash: string;
  projectId: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
      <GitCommit size={10} />
      inherited from{' '}
      <a
        href={`/project/${projectId}/commit/${encodeURIComponent(parentHash)}`}
        className="font-mono text-[var(--accent-commit)] hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {shortHash(parentHash)}
      </a>
    </span>
  );
}
